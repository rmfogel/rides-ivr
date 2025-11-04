import express from 'express';
import { DateTime } from 'luxon';
import { TZ } from '../utils/time.js';
import { 
  addOffer, 
  getOfferById,
  getUserByPhone,
  cancelOffer,
  upsertUser,
  getRequestById
} from '../db/repo.js';
import { collections } from '../db/mongoClient.js';
import { matchNewOffer } from '../engine/matching.js';
import logger from '../utils/logger.js';

export const offerRideRouter = express.Router();

/**
 * Normalize phone number for Israeli system
 * Converts +972 to 0, removes non-digits
 */
function normalizeIsraeliPhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^+\d]/g, '');
  if (cleaned.startsWith('+972')) {
    cleaned = '0' + cleaned.substring(4);
  }
  return cleaned;
}

/**
 * Validate phone number format (Israeli)
 */
function validatePhone(phone) {
  const phoneRegex = /^0\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate date is not in the past
 */
function validateFutureDate(dateStr) {
  try {
    const date = DateTime.fromISO(dateStr).setZone(TZ).startOf('day');
    const today = DateTime.now().setZone(TZ).startOf('day');
    return date >= today;
  } catch {
    return false;
  }
}

/**
 * Validate time format (HH:mm)
 */
function validateTime(timeStr) {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeStr);
}

/**
 * POST /api/rides/offer
 * Create a new ride offer
 */
offerRideRouter.post('/', async (req, res) => {
  try {
    const {
      phone,
      direction,
      date,
      departureTime,
      totalSeats,
      maleOnlySeats,
      femaleOnlySeats,
      notes
    } = req.body;

    logger.info('Received offer ride request', { phone, direction, date, departureTime });

    // Validate required fields
    if (!phone || !direction || !date || !departureTime || totalSeats === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['phone', 'direction', 'date', 'departureTime', 'totalSeats']
      });
    }

    // Normalize and validate phone
    const cleanPhone = normalizeIsraeliPhone(phone);
    if (!validatePhone(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Expected format: 0501234567'
      });
    }

    // Validate direction
    if (!['FROM', 'TO'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid direction. Must be FROM or TO'
      });
    }

    // Validate date
    if (!validateFutureDate(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date or date is in the past'
      });
    }

    // Validate time
    if (!validateTime(departureTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time format. Expected format: HH:mm'
      });
    }

    // Validate seat counts
    const total = parseInt(totalSeats, 10);
    const maleOnly = parseInt(maleOnlySeats || 0, 10);
    const femaleOnly = parseInt(femaleOnlySeats || 0, 10);

    if (isNaN(total) || total < 1 || total > 9) {
      return res.status(400).json({
        success: false,
        error: 'Total seats must be between 1 and 9'
      });
    }

    if (isNaN(maleOnly) || maleOnly < 0) {
      return res.status(400).json({
        success: false,
        error: 'Male-only seats must be 0 or greater'
      });
    }

    if (isNaN(femaleOnly) || femaleOnly < 0) {
      return res.status(400).json({
        success: false,
        error: 'Female-only seats must be 0 or greater'
      });
    }

    if (maleOnly + femaleOnly > total) {
      return res.status(400).json({
        success: false,
        error: 'Sum of male-only and female-only seats cannot exceed total seats'
      });
    }

    // Calculate anygender seats
    const anygenderSeats = total - maleOnly - femaleOnly;

    // Parse date and time
    const rideDate = DateTime.fromISO(date).setZone(TZ);
    const [hours, minutes] = departureTime.split(':').map(t => parseInt(t, 10));
    const departureDateTime = rideDate.set({
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0
    });

    // Check if datetime is in the past
    const now = DateTime.now().setZone(TZ);
    if (departureDateTime < now) {
      return res.status(400).json({
        success: false,
        error: 'Departure time cannot be in the past'
      });
    }

    // Get or create user
    let user = await getUserByPhone(cleanPhone);
    if (!user) {
      // Create minimal user entry
      user = await upsertUser({
        phone: cleanPhone,
        is_allowed: true
      });
    }

    // Create the ride offer
    const rideOffer = {
      driver_phone: cleanPhone,
      user_id: user.id,
      direction: direction,
      departure_time: departureDateTime.toJSDate(),
      seats_male_only: maleOnly,
      seats_female_only: femaleOnly,
      seats_anygender: anygenderSeats,
      notes: notes || null
    };

    // Add the offer to the database
    const createdOffer = await addOffer(rideOffer);

    logger.info('Ride offer created successfully', {
      offerId: createdOffer.id,
      phone: cleanPhone,
      direction,
      totalSeats: total
    });

    // Try to find matches immediately
    const { requests } = await collections();
    
    // Find compatible requests
    const query = {
      direction: direction,
      status: 'open',
      earliest_time: { $lte: departureDateTime.toJSDate() },
      latest_time: { $gte: departureDateTime.toJSDate() }
    };

    const compatibleRequests = await requests.find(query).toArray();
    logger.debug('Found compatible requests', { count: compatibleRequests.length });

    // Run matching algorithm
    const matches = await matchNewOffer(createdOffer, compatibleRequests.map(r => ({
      ...r,
      id: r._id.toString()
    })));

    logger.info('Matching completed for new offer', {
      offerId: createdOffer.id,
      matchCount: matches.length
    });

    // Return success response with matches
    res.status(201).json({
      success: true,
      offer: {
        id: createdOffer.id,
        direction: createdOffer.direction,
        departureTime: departureDateTime.toISO(),
        totalSeats: total,
        maleOnlySeats: maleOnly,
        femaleOnlySeats: femaleOnly,
        anygenderSeats: anygenderSeats
      },
      matchCount: matches.length,
      matches: matches.slice(0, 5).map(m => ({
        matchId: m.id,
        requestId: m.request_id,
        score: m.score
      })),
      message: matches.length > 0 
        ? `נמצאו ${matches.length} התאמות אפשריות לנסיעה שלך!`
        : 'ההצעה נרשמה בהצלחה. נעדכן אותך כשנמצא התאמה.'
    });

  } catch (error) {
    logger.error('Error creating ride offer', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/rides/offer
 * Get all offers for a specific phone number
 */
offerRideRouter.get('/', async (req, res) => {
  try {
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    const cleanPhone = normalizeIsraeliPhone(phone);
    if (!validatePhone(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    const { offers } = await collections();
    
    // Get all offers for this phone
    const userOffers = await offers
      .find({ 
        driver_phone: cleanPhone,
        status: { $in: ['active', 'partial', 'matched'] }
      })
      .sort({ created_at: -1 })
      .toArray();

    logger.info('Retrieved offers for phone', {
      phone: cleanPhone,
      count: userOffers.length
    });

    // Format the response
    const formattedOffers = userOffers.map(offer => {
      const departureDateTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
      
      return {
        id: offer._id.toString(),
        direction: offer.direction,
        date: departureDateTime.toFormat('dd/MM/yyyy'),
        departureTime: departureDateTime.toFormat('HH:mm'),
        departureTimeDisplay: departureDateTime.toFormat('dd/MM/yyyy HH:mm'),
        totalSeats: (offer.seats_male_only || 0) + (offer.seats_female_only || 0) + (offer.seats_anygender || 0),
        maleOnlySeats: offer.seats_male_only || 0,
        femaleOnlySeats: offer.seats_female_only || 0,
        anygenderSeats: offer.seats_anygender || 0,
        status: offer.status,
        notes: offer.notes,
        createdAt: offer.created_at
      };
    });

    res.json({
      success: true,
      offers: formattedOffers,
      count: formattedOffers.length
    });

  } catch (error) {
    logger.error('Error retrieving offers', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/rides/offer/:id
 * Get a specific offer by ID
 */
offerRideRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for verification'
      });
    }

    const cleanPhone = normalizeIsraeliPhone(phone);
    
    const offer = await getOfferById(id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found'
      });
    }

    // Verify ownership
    if (offer.driver_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view your own offers.'
      });
    }

    const departureDateTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
    
    res.json({
      success: true,
      offer: {
        id: offer.id,
        direction: offer.direction,
        departureTime: departureDateTime.toISO(),
        departureTimeDisplay: departureDateTime.toFormat('dd/MM/yyyy HH:mm'),
        totalSeats: (offer.seats_male_only || 0) + (offer.seats_female_only || 0) + (offer.seats_anygender || 0),
        maleOnlySeats: offer.seats_male_only || 0,
        femaleOnlySeats: offer.seats_female_only || 0,
        anygenderSeats: offer.seats_anygender || 0,
        status: offer.status,
        notes: offer.notes
      }
    });

  } catch (error) {
    logger.error('Error retrieving offer', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * PUT /api/rides/offer/:id
 * Update an existing offer
 */
offerRideRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      phone,
      direction,
      date,
      departureTime,
      totalSeats,
      maleOnlySeats,
      femaleOnlySeats,
      notes
    } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for verification'
      });
    }

    const cleanPhone = normalizeIsraeliPhone(phone);
    if (!validatePhone(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    // Get existing offer
    const existingOffer = await getOfferById(id);

    if (!existingOffer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found'
      });
    }

    // Verify ownership
    if (existingOffer.driver_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only update your own offers.'
      });
    }

    // Validate new values if provided
    const updateData = {};

    if (direction) {
      if (!['FROM', 'TO'].includes(direction)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid direction. Must be FROM or TO'
        });
      }
      updateData.direction = direction;
    }

    if (date || departureTime) {
      const newDate = date || DateTime.fromJSDate(existingOffer.departure_time).setZone(TZ).toISODate();
      const newTime = departureTime || DateTime.fromJSDate(existingOffer.departure_time).setZone(TZ).toFormat('HH:mm');

      if (!validateFutureDate(newDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date or date is in the past'
        });
      }

      if (!validateTime(newTime)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid time format. Expected format: HH:mm'
        });
      }

      const rideDate = DateTime.fromISO(newDate).setZone(TZ);
      const [hours, minutes] = newTime.split(':').map(t => parseInt(t, 10));
      const departureDateTime = rideDate.set({
        hour: hours,
        minute: minutes,
        second: 0,
        millisecond: 0
      });

      const now = DateTime.now().setZone(TZ);
      if (departureDateTime < now) {
        return res.status(400).json({
          success: false,
          error: 'Departure time cannot be in the past'
        });
      }

      updateData.departure_time = departureDateTime.toJSDate();
    }

    if (totalSeats !== undefined) {
      const total = parseInt(totalSeats, 10);
      const maleOnly = parseInt(maleOnlySeats !== undefined ? maleOnlySeats : existingOffer.seats_male_only || 0, 10);
      const femaleOnly = parseInt(femaleOnlySeats !== undefined ? femaleOnlySeats : existingOffer.seats_female_only || 0, 10);

      if (isNaN(total) || total < 1 || total > 9) {
        return res.status(400).json({
          success: false,
          error: 'Total seats must be between 1 and 9'
        });
      }

      if (maleOnly + femaleOnly > total) {
        return res.status(400).json({
          success: false,
          error: 'Sum of male-only and female-only seats cannot exceed total seats'
        });
      }

      updateData.seats_male_only = maleOnly;
      updateData.seats_female_only = femaleOnly;
      updateData.seats_anygender = total - maleOnly - femaleOnly;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    updateData.updated_at = new Date();

    // Update the offer
    const { offers } = await collections();
    const result = await offers.findOneAndUpdate(
      { _id: existingOffer._id },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    const updatedOffer = result.value || result;

    logger.info('Offer updated successfully', {
      offerId: id,
      phone: cleanPhone,
      updatedFields: Object.keys(updateData)
    });

    const departureDateTime = DateTime.fromJSDate(updatedOffer.departure_time).setZone(TZ);

    res.json({
      success: true,
      offer: {
        id: updatedOffer._id.toString(),
        direction: updatedOffer.direction,
        departureTime: departureDateTime.toISO(),
        departureTimeDisplay: departureDateTime.toFormat('dd/MM/yyyy HH:mm'),
        totalSeats: (updatedOffer.seats_male_only || 0) + (updatedOffer.seats_female_only || 0) + (updatedOffer.seats_anygender || 0),
        maleOnlySeats: updatedOffer.seats_male_only || 0,
        femaleOnlySeats: updatedOffer.seats_female_only || 0,
        anygenderSeats: updatedOffer.seats_anygender || 0,
        status: updatedOffer.status,
        notes: updatedOffer.notes
      },
      message: 'ההצעה עודכנה בהצלחה'
    });

  } catch (error) {
    logger.error('Error updating offer', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/rides/offer/:id
 * Cancel/delete an offer
 */
offerRideRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for verification'
      });
    }

    const cleanPhone = normalizeIsraeliPhone(phone);
    
    const existingOffer = await getOfferById(id);

    if (!existingOffer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found'
      });
    }

    // Verify ownership
    if (existingOffer.driver_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only delete your own offers.'
      });
    }

    // Cancel the offer (sets status to 'cancelled' and updates related matches)
    await cancelOffer(id);

    logger.info('Offer cancelled successfully', {
      offerId: id,
      phone: cleanPhone
    });

    res.json({
      success: true,
      message: 'ההצעה בוטלה בהצלחה'
    });

  } catch (error) {
    logger.error('Error deleting offer', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /:id/matches - Get all matches for a specific offer
 * Query params: phone (for verification)
 * Returns: Array of matches with full request details
 */
offerRideRouter.get('/:id/matches', async (req, res) => {
  try {
    const { id } = req.params;
    const { phone } = req.query;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required for verification'
      });
    }

    const cleanPhone = normalizeIsraeliPhone(phone);
    
    const existingOffer = await getOfferById(id);

    if (!existingOffer) {
      return res.status(404).json({
        success: false,
        error: 'Offer not found'
      });
    }

    // Verify ownership
    if (existingOffer.driver_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view matches for your own offers.'
      });
    }

    // Get all matches for this offer
    const { matches } = await collections();
    const { ObjectId } = await import('mongodb');
    
    // Filter only active matches (not declined or cancelled)
    const matchDocs = await matches.find({ 
      offer_id: ObjectId.isValid(id) ? new ObjectId(id) : id,
      status: { $in: ['pending', 'notified', 'connected', 'accepted'] }
    }).toArray();

    // Populate each match with full request details
    const populatedMatches = await Promise.all(
      matchDocs.map(async (match) => {
        const request = await getRequestById(match.request_id.toString());
        
        if (!request) {
          return null;
        }
        
        // Format times for display
        const earliestDateTime = DateTime.fromJSDate(request.earliest_time).setZone(TZ);
        const latestDateTime = DateTime.fromJSDate(request.latest_time).setZone(TZ);
        const preferredDateTime = request.preferred_time ? DateTime.fromJSDate(request.preferred_time).setZone(TZ) : null;
        
        return {
          id: match._id.toString(),
          status: match.status,
          created_at: match.created_at,
          allocated_male: match.allocated_male || 0,
          allocated_female: match.allocated_female || 0,
          allocated_anygender: match.allocated_anygender || 0,
          allocated_couples: match.allocated_couples || 0,
          request: {
            id: request.id,
            rider_phone: request.rider_phone,
            rider_name: request.rider_name,
            direction: request.direction,
            date: earliestDateTime.toFormat('dd/MM/yyyy'),
            earliestTime: earliestDateTime.toFormat('HH:mm'),
            latestTime: latestDateTime.toFormat('HH:mm'),
            preferredTime: preferredDateTime ? preferredDateTime.toFormat('HH:mm') : null,
            maleCount: request.maleCount,
            femaleCount: request.femaleCount,
            childrenCount: request.childrenCount,
            couplesCount: request.couplesCount,
            together: request.together,
            notes: request.notes
          }
        };
      })
    );
    
    // Filter out null values (in case some requests were deleted)
    const validMatches = populatedMatches.filter(m => m !== null);

    logger.info('Retrieved matches for offer', {
      offerId: id,
      matchCount: validMatches.length
    });

    res.json({
      success: true,
      matches: validMatches
    });

  } catch (error) {
    logger.error('Error retrieving matches for offer', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'שגיאה בשליפת השילובים'
    });
  }
});

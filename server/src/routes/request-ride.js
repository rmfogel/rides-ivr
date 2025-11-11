import express from 'express';
import { DateTime } from 'luxon';
import { TZ } from '../utils/time.js';
import { 
  addRequest, 
  getRequestById,
  getUserByPhone,
  cancelRequest,
  upsertUser,
  getOfferById
} from '../db/repo.js';
import { collections } from '../db/mongoClient.js';
import { matchNewRequest } from '../engine/matching.js';
import logger from '../utils/logger.js';

export const requestRideRouter = express.Router();

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
  const phoneRegex = /^0\d{8,9}$/;  // Support 9 or 10 digits (8-9 after the 0)
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
 * POST /api/rides/request
 * Create a new ride request
 */
requestRideRouter.post('/', async (req, res) => {
  try {
    const {
      phone,
      direction,
      date,
      earliestTime,
      latestTime,
      preferredTime,
      maleCount,
      femaleCount,
      childrenCount,
      couplesCount,
      together,
      notes
    } = req.body;

    logger.info('Received ride request', { phone, direction, date, earliestTime, latestTime });

    // Validate required fields
    if (!phone || !direction || !date || !earliestTime || !latestTime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['phone', 'direction', 'date', 'earliestTime', 'latestTime']
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

    // Validate times
    if (!validateTime(earliestTime) || !validateTime(latestTime)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time format. Expected format: HH:mm'
      });
    }

    // Parse times for comparison
    const [earlyHours, earlyMinutes] = earliestTime.split(':').map(t => parseInt(t, 10));
    const [lateHours, lateMinutes] = latestTime.split(':').map(t => parseInt(t, 10));
    
    const earlyTotalMinutes = earlyHours * 60 + earlyMinutes;
    const lateTotalMinutes = lateHours * 60 + lateMinutes;

    if (earlyTotalMinutes >= lateTotalMinutes) {
      return res.status(400).json({
        success: false,
        error: 'Latest time must be after earliest time'
      });
    }

    // Validate preferred time if provided
    if (preferredTime) {
      if (!validateTime(preferredTime)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid preferred time format. Expected format: HH:mm'
        });
      }

      const [prefHours, prefMinutes] = preferredTime.split(':').map(t => parseInt(t, 10));
      const prefTotalMinutes = prefHours * 60 + prefMinutes;

      if (prefTotalMinutes < earlyTotalMinutes || prefTotalMinutes > lateTotalMinutes) {
        return res.status(400).json({
          success: false,
          error: 'Preferred time must be between earliest and latest times'
        });
      }
    }

    // Validate passenger counts
    const males = parseInt(maleCount || 0, 10);
    const females = parseInt(femaleCount || 0, 10);
    const children = parseInt(childrenCount || 0, 10);
    const couples = parseInt(couplesCount || 0, 10);

    if (isNaN(males) || males < 0 || males > 9) {
      return res.status(400).json({
        success: false,
        error: 'Male count must be between 0 and 9'
      });
    }

    if (isNaN(females) || females < 0 || females > 9) {
      return res.status(400).json({
        success: false,
        error: 'Female count must be between 0 and 9'
      });
    }

    if (isNaN(children) || children < 0 || children > 9) {
      return res.status(400).json({
        success: false,
        error: 'Children count must be between 0 and 9'
      });
    }

    if (isNaN(couples) || couples < 0) {
      return res.status(400).json({
        success: false,
        error: 'Couples count must be 0 or greater'
      });
    }

    const totalAdults = males + females;
    const totalPassengers = totalAdults + children;

    if (totalPassengers === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one passenger is required'
      });
    }

    if (totalPassengers > 9) {
      return res.status(400).json({
        success: false,
        error: 'Total passengers cannot exceed 9'
      });
    }

    if (couples * 2 > totalAdults) {
      return res.status(400).json({
        success: false,
        error: 'Number of couples cannot exceed number of adults divided by 2'
      });
    }

    // Parse date and times
    const rideDate = DateTime.fromISO(date).setZone(TZ);
    
    const earliestDateTime = rideDate.set({
      hour: earlyHours,
      minute: earlyMinutes,
      second: 0,
      millisecond: 0
    });

    const latestDateTime = rideDate.set({
      hour: lateHours,
      minute: lateMinutes,
      second: 0,
      millisecond: 0
    });

    // Check if earliest time is in the past
    const now = DateTime.now().setZone(TZ);
    if (earliestDateTime < now) {
      return res.status(400).json({
        success: false,
        error: 'Earliest time cannot be in the past'
      });
    }

    let preferredDateTime = null;
    if (preferredTime) {
      const [prefHours, prefMinutes] = preferredTime.split(':').map(t => parseInt(t, 10));
      preferredDateTime = rideDate.set({
        hour: prefHours,
        minute: prefMinutes,
        second: 0,
        millisecond: 0
      });
    }

    // Get or create user
    let user = await getUserByPhone(cleanPhone);
    if (!user) {
      user = await upsertUser({
        phone: cleanPhone,
        is_allowed: true
      });
    }

    // Create the ride request
    const rideRequest = {
      rider_phone: cleanPhone,
      user_id: user.id,
      direction: direction,
      earliest_time: earliestDateTime.toJSDate(),
      latest_time: latestDateTime.toJSDate(),
      preferred_time: preferredDateTime ? preferredDateTime.toJSDate() : null,
      passengers_male: males,
      passengers_female: females,
      children_count: children,
      passengers_total: totalPassengers,
      couples_count: couples,
      together: together !== false, // Default to true
      notes: notes || null
    };

    // Add the request to the database
    const createdRequest = await addRequest(rideRequest);

    logger.info('Ride request created successfully', {
      requestId: createdRequest.id,
      phone: cleanPhone,
      direction,
      totalPassengers
    });

    // Try to find matches immediately
    const { offers } = await collections();
    
    // Get current time in Israel timezone for comparison
    const nowInIsrael = DateTime.now().setZone(TZ);
    
    // Find compatible offers (only future rides)
    const query = {
      direction: direction,
      status: 'active',
      departure_time: { 
        $gte: earliestDateTime.toJSDate(),
        $lte: latestDateTime.toJSDate(),
        $gte: nowInIsrael.toJSDate() // Ensure the ride hasn't passed
      }
    };

    const compatibleOffers = await offers.find(query).toArray();
    logger.debug('Found compatible offers', { count: compatibleOffers.length });

    // Run matching algorithm
    const matches = await matchNewRequest(createdRequest, compatibleOffers.map(o => ({
      ...o,
      id: o._id.toString()
    })));

    logger.info('Matching completed for new request', {
      requestId: createdRequest.id,
      matchCount: matches.length
    });

    // Populate matches with full offer details
    const populatedMatches = await Promise.all(
      matches.slice(0, 10).map(async (match) => {
        const offer = await getOfferById(match.offer_id);
        if (!offer) return null;
        
        const departureDateTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
        
        return {
          matchId: match.id,
          status: match.status,
          allocated_male: match.allocated_male || 0,
          allocated_female: match.allocated_female || 0,
          allocated_anygender: match.allocated_anygender || 0,
          allocated_couples: match.allocated_couples || 0,
          offer: {
            id: offer.id,
            driver_phone: offer.driver_phone,
            driver_name: offer.driver_name,
            direction: offer.direction,
            date: departureDateTime.toFormat('dd/MM/yyyy'),
            departureTime: departureDateTime.toFormat('HH:mm'),
            totalSeats: (offer.seats_male_only || 0) + (offer.seats_female_only || 0) + (offer.seats_anygender || 0),
            maleOnlySeats: offer.seats_male_only || 0,
            femaleOnlySeats: offer.seats_female_only || 0,
            anygenderSeats: offer.seats_anygender || 0,
            notes: offer.notes
          }
        };
      })
    );

    const validMatches = populatedMatches.filter(m => m !== null);

    // Return success response with matches
    res.status(201).json({
      success: true,
      request: {
        id: createdRequest.id,
        direction: createdRequest.direction,
        earliestTime: earliestDateTime.toISO(),
        latestTime: latestDateTime.toISO(),
        preferredTime: preferredDateTime ? preferredDateTime.toISO() : null,
        earliestTimeDisplay: earliestDateTime.toFormat('dd/MM/yyyy HH:mm'),
        latestTimeDisplay: latestDateTime.toFormat('HH:mm'),
        totalPassengers,
        maleCount: males,
        femaleCount: females,
        childrenCount: children,
        couplesCount: couples,
        together: rideRequest.together
      },
      matchCount: matches.length,
      matches: validMatches,
      message: matches.length > 0 
        ? `נמצאו ${matches.length} התאמות! אנא אשר או דחה כל התאמה.`
        : 'הבקשה נרשמה בהצלחה. נעדכן אותך כשנמצא התאמה.'
    });

  } catch (error) {
    logger.error('Error creating ride request', {
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
 * GET /api/rides/request
 * Get all requests for a specific phone number
 */
requestRideRouter.get('/', async (req, res) => {
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

    const { requests } = await collections();
    
    // Get current time in Israel timezone
    const nowInIsrael = DateTime.now().setZone(TZ);
    
    // Get all requests for this phone
    const userRequests = await requests
      .find({ 
        rider_phone: cleanPhone,
        status: { $in: ['open', 'partial', 'matched'] }
      })
      .sort({ created_at: -1 })
      .toArray();
    
    // Filter out rides from past days (keep all rides from today until end of day)
    const activeRequests = userRequests.filter(request => {
      const latestTime = DateTime.fromJSDate(request.latest_time).setZone(TZ);
      const rideDate = latestTime.startOf('day');
      const today = nowInIsrael.startOf('day');
      
      // Keep rides from today and future dates
      return rideDate >= today;
    });

    logger.info('Retrieved requests for phone', {
      phone: cleanPhone,
      totalCount: userRequests.length,
      activeCount: activeRequests.length,
      filteredPastRides: userRequests.length - activeRequests.length
    });

    // Format the response
    const formattedRequests = activeRequests.map(request => {
      const earliestDateTime = DateTime.fromJSDate(request.earliest_time).setZone(TZ);
      const latestDateTime = DateTime.fromJSDate(request.latest_time).setZone(TZ);
      const preferredDateTime = request.preferred_time ? DateTime.fromJSDate(request.preferred_time).setZone(TZ) : null;
      
      return {
        id: request._id.toString(),
        direction: request.direction,
        date: earliestDateTime.toFormat('dd/MM/yyyy'),
        earliestTime: earliestDateTime.toFormat('HH:mm'),
        latestTime: latestDateTime.toFormat('HH:mm'),
        preferredTime: preferredDateTime ? preferredDateTime.toFormat('HH:mm') : null,
        earliestTimeDisplay: earliestDateTime.toFormat('dd/MM/yyyy HH:mm'),
        latestTimeDisplay: latestDateTime.toFormat('HH:mm'),
        preferredTimeDisplay: preferredDateTime ? preferredDateTime.toFormat('HH:mm') : null,
        totalPassengers: request.passengers_total || 0,
        maleCount: request.passengers_male || 0,
        femaleCount: request.passengers_female || 0,
        childrenCount: request.children_count || 0,
        couplesCount: request.couples_count || 0,
        together: request.together !== false,
        status: request.status,
        notes: request.notes,
        createdAt: request.created_at
      };
    });

    res.json({
      success: true,
      requests: formattedRequests,
      count: formattedRequests.length
    });

  } catch (error) {
    logger.error('Error retrieving requests', {
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
 * GET /api/rides/request/:id
 * Get a specific request by ID
 */
requestRideRouter.get('/:id', async (req, res) => {
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
    
    const request = await getRequestById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Verify ownership
    if (request.rider_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view your own requests.'
      });
    }

    const earliestDateTime = DateTime.fromJSDate(request.earliest_time).setZone(TZ);
    const latestDateTime = DateTime.fromJSDate(request.latest_time).setZone(TZ);
    const preferredDateTime = request.preferred_time ? DateTime.fromJSDate(request.preferred_time).setZone(TZ) : null;
    
    res.json({
      success: true,
      request: {
        id: request.id,
        direction: request.direction,
        earliestTime: earliestDateTime.toISO(),
        latestTime: latestDateTime.toISO(),
        preferredTime: preferredDateTime ? preferredDateTime.toISO() : null,
        earliestTimeDisplay: earliestDateTime.toFormat('dd/MM/yyyy HH:mm'),
        latestTimeDisplay: latestDateTime.toFormat('HH:mm'),
        preferredTimeDisplay: preferredDateTime ? preferredDateTime.toFormat('HH:mm') : null,
        totalPassengers: request.passengers_total || 0,
        maleCount: request.passengers_male || 0,
        femaleCount: request.passengers_female || 0,
        childrenCount: request.children_count || 0,
        couplesCount: request.couples_count || 0,
        together: request.together !== false,
        status: request.status,
        notes: request.notes
      }
    });

  } catch (error) {
    logger.error('Error retrieving request', {
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
 * PUT /api/rides/request/:id
 * Update an existing request
 */
requestRideRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      phone,
      direction,
      date,
      earliestTime,
      latestTime,
      preferredTime,
      maleCount,
      femaleCount,
      childrenCount,
      couplesCount,
      together,
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

    // Get existing request
    const existingRequest = await getRequestById(id);

    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Verify ownership
    if (existingRequest.rider_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only update your own requests.'
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

    // Handle date and time updates
    if (date || earliestTime || latestTime) {
      const existingEarliest = DateTime.fromJSDate(existingRequest.earliest_time).setZone(TZ);
      const existingLatest = DateTime.fromJSDate(existingRequest.latest_time).setZone(TZ);

      const newDate = date || existingEarliest.toISODate();
      const newEarliestTime = earliestTime || existingEarliest.toFormat('HH:mm');
      const newLatestTime = latestTime || existingLatest.toFormat('HH:mm');

      if (!validateFutureDate(newDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date or date is in the past'
        });
      }

      if (!validateTime(newEarliestTime) || !validateTime(newLatestTime)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid time format. Expected format: HH:mm'
        });
      }

      const rideDate = DateTime.fromISO(newDate).setZone(TZ);
      const [earlyHours, earlyMinutes] = newEarliestTime.split(':').map(t => parseInt(t, 10));
      const [lateHours, lateMinutes] = newLatestTime.split(':').map(t => parseInt(t, 10));

      const earliestDateTime = rideDate.set({
        hour: earlyHours,
        minute: earlyMinutes,
        second: 0,
        millisecond: 0
      });

      const latestDateTime = rideDate.set({
        hour: lateHours,
        minute: lateMinutes,
        second: 0,
        millisecond: 0
      });

      if (earliestDateTime >= latestDateTime) {
        return res.status(400).json({
          success: false,
          error: 'Latest time must be after earliest time'
        });
      }

      const now = DateTime.now().setZone(TZ);
      if (earliestDateTime < now) {
        return res.status(400).json({
          success: false,
          error: 'Earliest time cannot be in the past'
        });
      }

      updateData.earliest_time = earliestDateTime.toJSDate();
      updateData.latest_time = latestDateTime.toJSDate();
    }

    if (preferredTime !== undefined) {
      if (preferredTime) {
        if (!validateTime(preferredTime)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid preferred time format. Expected format: HH:mm'
          });
        }

        const earliest = updateData.earliest_time || existingRequest.earliest_time;
        const latest = updateData.latest_time || existingRequest.latest_time;
        const rideDate = DateTime.fromJSDate(earliest).setZone(TZ);

        const [prefHours, prefMinutes] = preferredTime.split(':').map(t => parseInt(t, 10));
        const preferredDateTime = rideDate.set({
          hour: prefHours,
          minute: prefMinutes,
          second: 0,
          millisecond: 0
        });

        if (preferredDateTime < DateTime.fromJSDate(earliest).setZone(TZ) || 
            preferredDateTime > DateTime.fromJSDate(latest).setZone(TZ)) {
          return res.status(400).json({
            success: false,
            error: 'Preferred time must be between earliest and latest times'
          });
        }

        updateData.preferred_time = preferredDateTime.toJSDate();
      } else {
        updateData.preferred_time = null;
      }
    }

    // Validate passenger counts if provided
    if (maleCount !== undefined || femaleCount !== undefined || childrenCount !== undefined) {
      const males = parseInt(maleCount !== undefined ? maleCount : existingRequest.passengers_male || 0, 10);
      const females = parseInt(femaleCount !== undefined ? femaleCount : existingRequest.passengers_female || 0, 10);
      const children = parseInt(childrenCount !== undefined ? childrenCount : existingRequest.children_count || 0, 10);
      const couples = parseInt(couplesCount !== undefined ? couplesCount : existingRequest.couples_count || 0, 10);

      const totalAdults = males + females;
      const totalPassengers = totalAdults + children;

      if (totalPassengers === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one passenger is required'
        });
      }

      if (totalPassengers > 9) {
        return res.status(400).json({
          success: false,
          error: 'Total passengers cannot exceed 9'
        });
      }

      if (couples * 2 > totalAdults) {
        return res.status(400).json({
          success: false,
          error: 'Number of couples cannot exceed number of adults divided by 2'
        });
      }

      updateData.passengers_male = males;
      updateData.passengers_female = females;
      updateData.children_count = children;
      updateData.passengers_total = totalPassengers;
      updateData.couples_count = couples;
    }

    if (together !== undefined) {
      updateData.together = together !== false;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    updateData.updated_at = new Date();

    // Update the request
    const { requests } = await collections();
    const result = await requests.findOneAndUpdate(
      { _id: existingRequest._id },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    const updatedRequest = result.value || result;

    logger.info('Request updated successfully', {
      requestId: id,
      phone: cleanPhone,
      updatedFields: Object.keys(updateData)
    });

    const earliestDateTime = DateTime.fromJSDate(updatedRequest.earliest_time).setZone(TZ);
    const latestDateTime = DateTime.fromJSDate(updatedRequest.latest_time).setZone(TZ);
    const preferredDateTime = updatedRequest.preferred_time ? DateTime.fromJSDate(updatedRequest.preferred_time).setZone(TZ) : null;

    res.json({
      success: true,
      request: {
        id: updatedRequest._id.toString(),
        direction: updatedRequest.direction,
        earliestTime: earliestDateTime.toISO(),
        latestTime: latestDateTime.toISO(),
        preferredTime: preferredDateTime ? preferredDateTime.toISO() : null,
        earliestTimeDisplay: earliestDateTime.toFormat('dd/MM/yyyy HH:mm'),
        latestTimeDisplay: latestDateTime.toFormat('HH:mm'),
        preferredTimeDisplay: preferredDateTime ? preferredDateTime.toFormat('HH:mm') : null,
        totalPassengers: updatedRequest.passengers_total || 0,
        maleCount: updatedRequest.passengers_male || 0,
        femaleCount: updatedRequest.passengers_female || 0,
        childrenCount: updatedRequest.children_count || 0,
        couplesCount: updatedRequest.couples_count || 0,
        together: updatedRequest.together !== false,
        status: updatedRequest.status,
        notes: updatedRequest.notes
      },
      message: 'הבקשה עודכנה בהצלחה'
    });

  } catch (error) {
    logger.error('Error updating request', {
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
 * DELETE /api/rides/request/:id
 * Cancel/delete a request
 */
requestRideRouter.delete('/:id', async (req, res) => {
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
    
    const existingRequest = await getRequestById(id);

    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Verify ownership
    if (existingRequest.rider_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only delete your own requests.'
      });
    }

    // Cancel the request (sets status to 'cancelled' and updates related matches)
    await cancelRequest(id);

    logger.info('Request cancelled successfully', {
      requestId: id,
      phone: cleanPhone
    });

    res.json({
      success: true,
      message: 'הבקשה בוטלה בהצלחה'
    });

  } catch (error) {
    logger.error('Error deleting request', {
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
 * GET /:id/matches - Get all matches for a specific request
 * Query params: phone (for verification)
 * Returns: Array of matches with full offer details
 */
requestRideRouter.get('/:id/matches', async (req, res) => {
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
    
    const existingRequest = await getRequestById(id);

    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    // Verify ownership
    if (existingRequest.rider_phone !== cleanPhone) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only view matches for your own requests.'
      });
    }

    // Get all matches for this request
    const { matches } = await collections();
    const { ObjectId } = await import('mongodb');
    
    // Filter only active matches (not declined or cancelled)
    const matchDocs = await matches.find({ 
      request_id: ObjectId.isValid(id) ? new ObjectId(id) : id,
      status: { $in: ['pending', 'notified', 'connected', 'accepted'] }
    }).toArray();

    // Populate each match with full offer details
    const populatedMatches = await Promise.all(
      matchDocs.map(async (match) => {
        const offer = await getOfferById(match.offer_id.toString());
        
        if (!offer) {
          return null;
        }
        
        // Format time for display
        const departureDateTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
        
        return {
          id: match._id.toString(),
          status: match.status,
          created_at: match.created_at,
          allocated_male: match.allocated_male || 0,
          allocated_female: match.allocated_female || 0,
          allocated_anygender: match.allocated_anygender || 0,
          allocated_couples: match.allocated_couples || 0,
          offer: {
            id: offer.id,
            driver_phone: offer.driver_phone,
            driver_name: offer.driver_name,
            direction: offer.direction,
            date: departureDateTime.toFormat('dd/MM/yyyy'),
            departureTime: departureDateTime.toFormat('HH:mm'),
            totalSeats: (offer.seats_male_only || 0) + (offer.seats_female_only || 0) + (offer.seats_anygender || 0),
            maleOnlySeats: offer.seats_male_only || 0,
            femaleOnlySeats: offer.seats_female_only || 0,
            anygenderSeats: offer.seats_anygender || 0,
            notes: offer.notes
          }
        };
      })
    );
    
    // Filter out null values (in case some offers were deleted)
    const validMatches = populatedMatches.filter(m => m !== null);

    logger.info('Retrieved matches for request', {
      requestId: id,
      matchCount: validMatches.length
    });

    res.json({
      success: true,
      matches: validMatches
    });

  } catch (error) {
    logger.error('Error retrieving matches for request', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'שגיאה בשליפת השילובים'
    });
  }
});

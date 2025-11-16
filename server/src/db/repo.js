import { ObjectId } from 'mongodb';
import { collections, ensureIndexes } from './mongoClient.js';
import logger from '../utils/logger.js';

async function init() { 
  try {
    logger.debug('Initializing repository indexes');
    await ensureIndexes(); 
    logger.info('Repository indexes initialized');
  } catch (err) {
    logger.error('Failed to initialize repository indexes', {
      error: err.message,
      stack: err.stack
    });
  }
}
init().catch(() => {});

export async function upsertUser(user) {
  const { users } = await collections();
  const { phone, name = null, is_allowed = true, declared_gender = null } = user;
  
  logger.debug('Upserting user', { 
    phone, 
    hasName: name !== null, 
    hasGender: declared_gender !== null 
  });
  
  const update = {
    $setOnInsert: { created_at: new Date() },
    $set: { phone, is_allowed, updated_at: new Date() },
  };
  if (name !== null) update.$set.name = name;
  if (declared_gender !== null) update.$set.declared_gender = declared_gender;
  
  try {
    const res = await users.findOneAndUpdate({ phone }, update, { upsert: true, returnDocument: 'after' });
    const doc = normalize(res.value || res);
    logger.info('User upserted successfully', { userId: doc.id, phone });
    // Handle MongoDB driver version differences (v5+ returns the document directly)
    return doc;
  } catch (err) {
    logger.error('Failed to upsert user', {
      phone,
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

export async function addOffer(offer) {
  const { offers } = await collections();
  const doc = { ...offer, status: 'active', created_at: new Date() };
  
  // Convert user_id to ObjectId if provided as string
  if (doc.user_id && typeof doc.user_id === 'string') {
    try {
      doc.user_id = oid(doc.user_id);
    } catch (err) {
      logger.warn('Invalid user_id format in offer', { user_id: doc.user_id });
    }
  }
  
  const { insertedId } = await offers.insertOne(doc);
  doc.id = insertedId.toString();
  return normalize(doc);
}

export async function addRequest(request) {
  const { requests } = await collections();
  const doc = { ...request, status: 'open', created_at: new Date() };
  
  // Convert user_id to ObjectId if provided as string
  if (doc.user_id && typeof doc.user_id === 'string') {
    try {
      doc.user_id = oid(doc.user_id);
    } catch (err) {
      logger.warn('Invalid user_id format in request', { user_id: doc.user_id });
    }
  }
  
  const { insertedId } = await requests.insertOne(doc);
  doc.id = insertedId.toString();
  return normalize(doc);
}

export async function addMatch(match) {
  const { matches } = await collections();
  const now = new Date();
  const doc = { ...match, offer_id: oid(match.offer_id), request_id: oid(match.request_id), status: match.status || 'pending', created_at: now, updated_at: now };
  const { insertedId } = await matches.insertOne(doc);
  doc.id = insertedId.toString();
  return normalize(doc);
}

export async function getMatchById(id) {
  const { matches } = await collections();
  const doc = await matches.findOne({ _id: oid(id) });
  return normalize(doc);
}

export async function updateMatchStatus(id, status) {
  const { matches } = await collections();
  const res = await matches.findOneAndUpdate({ _id: oid(id) }, { $set: { status, updated_at: new Date() } }, { returnDocument: 'after' });
  return normalize(res.value || res);
}

export async function getMatchesByRequestId(requestId) {
  const { matches } = await collections();
  const rid = oid(requestId);
  return (await matches.find({ request_id: rid }).toArray()).map(normalize);
}

export async function getMatchesByOfferId(offerId) {
  const { matches } = await collections();
  const oid_offer = oid(offerId);
  return (await matches.find({ offer_id: oid_offer }).toArray()).map(normalize);
}

export async function listPendingMatchesForPhone(phone) {
  const { matches, requests } = await collections();
  const reqIds = await requests.find({ rider_phone: phone, status: { $in: ['open','partial','matched'] } }, { projection: { _id: 1 } }).toArray();
  const ids = reqIds.map(r => r._id);
  const list = await matches.find({ request_id: { $in: ids }, status: { $in: ['pending','notified','connected'] } }).sort({ created_at: 1 }).toArray();
  return list.map(normalize);
}

export async function listPendingMatchesForDriverPhone(phone) {
  const { matches, offers } = await collections();
  const offerIds = await offers.find({ driver_phone: phone, status: 'active' }, { projection: { _id: 1 } }).toArray();
  const ids = offerIds.map(o => o._id);
  const list = await matches.find({ offer_id: { $in: ids }, status: { $in: ['pending','notified','connected'] } }).sort({ created_at: 1 }).toArray();
  return list.map(normalize);
}

/**
 * Calculate and update the status of an offer based on allocated seats
 * @param {string} offerId - The offer ID
 * @returns {Promise<string>} The new status ('active', 'partial', or 'matched')
 */
export async function updateOfferStatusByAllocations(offerId) {
  const { offers, matches } = await collections();
  
  logger.debug('Updating offer status based on allocations', { offerId });
  
  // Get the offer
  const offer = await getOfferById(offerId);
  if (!offer) {
    logger.warn('Offer not found for status update', { offerId });
    return null;
  }
  
  // Calculate total available seats
  const totalSeats = (offer.seats_male_only || 0) + (offer.seats_female_only || 0) + (offer.seats_anygender || 0);
  
  // Get all active matches (pending, notified, connected) for this offer
  const activeMatches = await matches.find({
    offer_id: oid(offerId),
    status: { $in: ['pending', 'notified', 'connected', 'accepted'] }
  }).toArray();
  
  // Calculate total allocated seats
  let allocatedSeats = 0;
  activeMatches.forEach(match => {
    allocatedSeats += (match.allocated_male || 0);
    allocatedSeats += (match.allocated_female || 0);
    allocatedSeats += (match.allocated_anygender || 0);
    allocatedSeats += (match.allocated_couples || 0) * 2; // Each couple = 2 seats
  });
  
  // Determine new status
  let newStatus = 'active';
  if (allocatedSeats >= totalSeats) {
    newStatus = 'matched'; // Fully matched
  } else if (allocatedSeats > 0) {
    newStatus = 'partial'; // Partially matched
  }
  
  logger.info('Calculated offer status', {
    offerId,
    totalSeats,
    allocatedSeats,
    activeMatchesCount: activeMatches.length,
    oldStatus: offer.status,
    newStatus
  });
  
  // Update the offer status if it changed
  if (offer.status !== newStatus) {
    await offers.updateOne(
      { _id: oid(offerId) },
      { $set: { status: newStatus, updated_at: new Date() } }
    );
    logger.info('Updated offer status', { offerId, from: offer.status, to: newStatus });
  }
  
  return newStatus;
}

/**
 * Calculate and update the status of a request based on allocated passengers
 * @param {string} requestId - The request ID
 * @returns {Promise<string>} The new status ('open', 'partial', or 'matched')
 */
export async function updateRequestStatusByAllocations(requestId) {
  const { requests, matches } = await collections();
  
  logger.debug('Updating request status based on allocations', { requestId });
  
  // Get the request
  const request = await getRequestById(requestId);
  if (!request) {
    logger.warn('Request not found for status update', { requestId });
    return null;
  }
  
  // Calculate total passengers needed
  const totalPassengers = (request.passengers_male || 0) + 
                         (request.passengers_female || 0) + 
                         (request.children_count || 0);
  
  // Get all active matches (pending, notified, connected) for this request
  const activeMatches = await matches.find({
    request_id: oid(requestId),
    status: { $in: ['pending', 'notified', 'connected', 'accepted'] }
  }).toArray();
  
  // Calculate total allocated passengers
  let allocatedPassengers = 0;
  activeMatches.forEach(match => {
    allocatedPassengers += (match.allocated_male || 0);
    allocatedPassengers += (match.allocated_female || 0);
    allocatedPassengers += (match.allocated_anygender || 0);
    allocatedPassengers += (match.allocated_couples || 0) * 2; // Each couple = 2 people
    allocatedPassengers += (match.allocated_children || 0);
  });
  
  // Determine new status
  let newStatus = 'open';
  if (allocatedPassengers >= totalPassengers) {
    newStatus = 'matched'; // Fully matched
  } else if (allocatedPassengers > 0) {
    newStatus = 'partial'; // Partially matched
  }
  
  logger.info('Calculated request status', {
    requestId,
    totalPassengers,
    allocatedPassengers,
    activeMatchesCount: activeMatches.length,
    oldStatus: request.status,
    newStatus
  });
  
  // Update the request status if it changed
  if (request.status !== newStatus) {
    await requests.updateOne(
      { _id: oid(requestId) },
      { $set: { status: newStatus, updated_at: new Date() } }
    );
    logger.info('Updated request status', { requestId, from: request.status, to: newStatus });
  }
  
  return newStatus;
}

export async function isAllowed(phone) {
  if (process.env.ALLOW_ALL_CALLERS === 'true') return true;
  const { users } = await collections();
  return true; // temporary override
  const u = await users.findOne({ phone });
  if (!u) return false; // stricter default
  return !!u.is_allowed;
}

export async function getOfferById(id) {
  const { offers } = await collections();
  const doc = await offers.findOne({ _id: oid(id) });
  return normalize(doc);
}

export async function getRequestById(id) {
  const { requests } = await collections();
  const doc = await requests.findOne({ _id: oid(id) });
  return normalize(doc);
}

/**
 * Get an offer by ID with populated user information
 * @param {string} id - Offer ID
 * @returns {Promise<Object|null>} Offer with user property containing full user details
 */
export async function getOfferWithUser(id) {
  const { offers, users } = await collections();
  const pipeline = [
    { $match: { _id: oid(id) } },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: {
        path: '$user',
        preserveNullAndEmptyArrays: true
      }
    }
  ];
  
  const results = await offers.aggregate(pipeline).toArray();
  if (results.length === 0) return null;
  
  const doc = normalize(results[0]);
  if (doc.user) {
    doc.user = normalize(doc.user);
  }
  
  // Log phone numbers and recording URL for debugging
  console.log('getOfferWithUser result:', {
    offerId: id,
    driver_phone: doc.driver_phone,
    driver_phone_length: doc.driver_phone?.length,
    user_phone: doc.user?.phone,
    user_phone_length: doc.user?.phone?.length,
    has_name_recording: !!doc.user?.name_recording_url,
    name_recording_url: doc.user?.name_recording_url
  });
  
  return doc;
}

/**
 * Get a request by ID with populated user information
 * @param {string} id - Request ID
 * @returns {Promise<Object|null>} Request with user property containing full user details
 */
export async function getRequestWithUser(id) {
  const { requests, users } = await collections();
  const pipeline = [
    { $match: { _id: oid(id) } },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: {
        path: '$user',
        preserveNullAndEmptyArrays: true
      }
    }
  ];
  
  const results = await requests.aggregate(pipeline).toArray();
  if (results.length === 0) return null;
  
  const doc = normalize(results[0]);
  if (doc.user) {
    doc.user = normalize(doc.user);
  }
  
  // Log phone numbers and recording URL for debugging
  console.log('getRequestWithUser result:', {
    requestId: id,
    rider_phone: doc.rider_phone,
    rider_phone_length: doc.rider_phone?.length,
    user_phone: doc.user?.phone,
    user_phone_length: doc.user?.phone?.length,
    has_name_recording: !!doc.user?.name_recording_url,
    name_recording_url: doc.user?.name_recording_url
  });
  
  return doc;
}

export async function getUserByPhone(phone) {
  const { users } = await collections();
  const doc = await users.findOne({ phone });
  return normalize(doc);
}

export async function updateOfferSeats(id, patch) {
  const { offers } = await collections();
  const res = await offers.findOneAndUpdate({ _id: oid(id) }, { $set: { ...patch } }, { returnDocument: 'after' });
  return normalize(res.value || res);
}

export async function updateRequestStatus(id, status) {
  const { requests } = await collections();
  const res = await requests.findOneAndUpdate({ _id: oid(id) }, { $set: { status } }, { returnDocument: 'after' });
  return normalize(res.value || res);
}

export async function cancelOffer(id) {
  const { offers, matches } = await collections();
  const offer = await getOfferById(id);
  if (!offer) return null;

  // First update the offer status
  const res = await offers.findOneAndUpdate(
    { _id: oid(id) },
    { $set: { status: 'cancelled', updated_at: new Date() } },
    { returnDocument: 'after' }
  );

  // Find all affected matches and their request IDs
  const affectedMatches = await matches.find(
    { offer_id: oid(id), status: { $in: ['pending', 'notified', 'accepted'] } }
  ).toArray();
  
  const affectedRequestIds = [...new Set(affectedMatches.map(m => m.request_id.toString()))];

  // Update the matches to cancelled
  await matches.updateMany(
    { offer_id: oid(id), status: { $in: ['pending', 'notified', 'accepted'] } },
    { $set: { status: 'cancelled', updated_at: new Date() } }
  );

  // Update status of all affected requests
  logger.info('Updating status of affected requests after offer cancellation', {
    offerId: id,
    affectedRequestCount: affectedRequestIds.length
  });
  
  for (const requestId of affectedRequestIds) {
    await updateRequestStatusByAllocations(requestId);
  }

  return normalize(res.value || res);
}

export async function cancelRequest(id) {
  const { requests, matches } = await collections();
  const request = await getRequestById(id);
  if (!request) return null;

  // First update the request status
  const res = await requests.findOneAndUpdate(
    { _id: oid(id) },
    { $set: { status: 'cancelled', updated_at: new Date() } },
    { returnDocument: 'after' }
  );

  // Find all affected matches and their offer IDs
  const affectedMatches = await matches.find(
    { request_id: oid(id), status: { $in: ['pending', 'notified', 'accepted'] } }
  ).toArray();
  
  const affectedOfferIds = [...new Set(affectedMatches.map(m => m.offer_id.toString()))];

  // Update the matches to cancelled
  await matches.updateMany(
    { request_id: oid(id), status: { $in: ['pending', 'notified', 'accepted'] } },
    { $set: { status: 'cancelled', updated_at: new Date() } }
  );

  // Update status of all affected offers
  logger.info('Updating status of affected offers after request cancellation', {
    requestId: id,
    affectedOfferCount: affectedOfferIds.length
  });
  
  for (const offerId of affectedOfferIds) {
    await updateOfferStatusByAllocations(offerId);
  }

  return normalize(res.value || res);
}

export async function getActiveOffersByDriverPhone(phone) {
  const { offers } = await collections();
  const list = await offers.find({ 
    driver_phone: phone,
    status: 'active',
    departure_time: { $gte: new Date() }
  }).sort({ departure_time: 1 }).toArray();
  return list.map(normalize);
}

export async function getActiveRequestsByRiderPhone(phone) {
  const { requests } = await collections();
  const list = await requests.find({
    rider_phone: phone,
    status: { $in: ['open', 'partial'] },
    latest_time: { $gte: new Date() }
  }).sort({ latest_time: 1 }).toArray();
  return list.map(normalize);
}

export async function getLastRideByPhone(phone, isDriver = true) {
  if (isDriver) {
    const { offers } = await collections();
    const lastOffer = await offers.find({ 
      driver_phone: phone 
    }).sort({ created_at: -1 }).limit(1).toArray();
    return lastOffer.length > 0 ? normalize(lastOffer[0]) : null;
  } else {
    const { requests } = await collections();
    const lastRequest = await requests.find({ 
      rider_phone: phone 
    }).sort({ created_at: -1 }).limit(1).toArray();
    return lastRequest.length > 0 ? normalize(lastRequest[0]) : null;
  }
}

export async function listOpenRequestsForOffer(offer) {
  const { requests } = await collections();
  const dep = new Date(offer.departure_time);
  const list = await requests.find({
    status: 'open',
    direction: offer.direction,
    earliest_time: { $lte: dep },
    latest_time: { $gte: dep }
  }).sort({ created_at: 1 }).toArray();
  return list.map(normalize);
}

export async function listActiveOffersForRequest(request) {
  const { offers } = await collections();
  const e = new Date(request.earliest_time);
  const l = new Date(request.latest_time);
  const list = await offers.find({
    status: 'active',
    direction: request.direction,
    departure_time: { $gte: e, $lte: l }
  }).sort({ departure_time: 1, created_at: 1 }).toArray();
  return list.map(normalize);
}

function oid(id) {
  if (!id) return undefined;
  try {
    return new ObjectId(id);
  } catch {
    // maybe numeric legacy id stored in request_id/offer_id fields
    return new ObjectId.createFromTime(0); // will not match anything
  }
}

function normalize(doc) {
  if (!doc) return null;
  if (doc._id) {
    doc.id = doc._id.toString();
  }
  // Convert ObjectId fields to strings for easier consumption
  if (doc.user_id && typeof doc.user_id === 'object') {
    doc.user_id = doc.user_id.toString();
  }
  return doc;
}

/**
 * Check if a user exists by phone number
 * @param {string} phone - Phone number to check
 * @returns {Promise<boolean>} True if user exists
 */
export async function checkUserExists(phone) {
  const { users } = await collections();
  logger.debug('Checking if user exists', { phone });
  
  try {
    const user = await users.findOne({ phone });
    const exists = user !== null;
    logger.debug('User existence check result', { phone, exists });
    return exists;
  } catch (err) {
    logger.error('Failed to check user existence', {
      phone,
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Save name recording URL for a user
 * @param {string} phone - Phone number
 * @param {string} recordingUrl - URL to Twilio recording
 * @returns {Promise<Object>} Updated user document
 */
export async function saveNameRecording(phone, recordingUrl) {
  const { users } = await collections();
  logger.debug('Saving name recording', { phone, hasUrl: !!recordingUrl });
  
  try {
    const res = await users.findOneAndUpdate(
      { phone },
      { 
        $set: { 
          name_recording_url: recordingUrl,
          updated_at: new Date() 
        },
        $setOnInsert: { 
          created_at: new Date(),
          is_allowed: true
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    
    const doc = normalize(res.value || res);
    logger.info('Name recording saved successfully', { 
      userId: doc.id, 
      phone 
    });
    return doc;
  } catch (err) {
    logger.error('Failed to save name recording', {
      phone,
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Save or update PIN for a user (PIN should be pre-hashed)
 * @param {string} phone - Phone number
 * @param {string} hashedPin - Hashed 4-digit PIN
 * @returns {Promise<Object>} Updated user document
 */
export async function savePIN(phone, hashedPin) {
  const { users } = await collections();
  logger.debug('Saving PIN', { phone });
  
  try {
    const res = await users.findOneAndUpdate(
      { phone },
      { 
        $set: { 
          pin: hashedPin,
          registered_via_ivr: true,
          updated_at: new Date() 
        },
        $setOnInsert: { 
          created_at: new Date(),
          is_allowed: true
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    
    const doc = normalize(res.value || res);
    logger.info('PIN saved successfully', { 
      userId: doc.id, 
      phone,
      registered: doc.registered_via_ivr
    });
    return doc;
  } catch (err) {
    logger.error('Failed to save PIN', {
      phone,
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Update PIN for existing user (PIN should be pre-hashed)
 * @param {string} phone - Phone number
 * @param {string} hashedPin - New hashed 4-digit PIN
 * @returns {Promise<Object|null>} Updated user document or null if user not found
 */
export async function updatePIN(phone, hashedPin) {
  const { users } = await collections();
  logger.debug('Updating PIN', { phone });
  
  try {
    const res = await users.findOneAndUpdate(
      { phone },
      { 
        $set: { 
          pin: hashedPin,
          updated_at: new Date() 
        }
      },
      { returnDocument: 'after' }
    );
    
    if (!res.value && !res) {
      logger.warn('Cannot update PIN - user not found', { phone });
      return null;
    }
    
    const doc = normalize(res.value || res);
    logger.info('PIN updated successfully', { 
      userId: doc.id, 
      phone
    });
    return doc;
  } catch (err) {
    logger.error('Failed to update PIN', {
      phone,
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Get user's stored hashed PIN for verification
 * @param {string} phone - Phone number
 * @returns {Promise<string|null>} Hashed PIN or null if not set
 */
export async function getUserPIN(phone) {
  const { users } = await collections();
  logger.debug('Getting user PIN', { phone });
  
  try {
    const user = await users.findOne({ phone }, { projection: { pin: 1 } });
    if (!user) {
      logger.debug('User not found when getting PIN', { phone });
      return null;
    }
    return user.pin || null;
  } catch (err) {
    logger.error('Failed to get user PIN', {
      phone,
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

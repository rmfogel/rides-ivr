import { addMatch, getRequestById, getOfferById } from "../db/repo.js";
import { ringbackRider, ringbackDriver } from "../notify/ringback.js";

function allocFromOffer(seats, need, allowSameGenderCouple=false, together=false) {
  // seats: { male_only, female_only, unisex }  // need: { couples, males, females }
  // res fields represent seat-type usage for this allocation
  const res = { allocated_couples: 0, allocated_male: 0, allocated_female: 0, allocated_unisex: 0 };
  const s = { ...seats };
  const n = { ...need };

  const tryAllocCouple = () => {
    // one male-only + one female-only
    if (s.male_only > 0 && s.female_only > 0) { s.male_only--; s.female_only--; res.allocated_couples++; res.allocated_male++; res.allocated_female++; return true; }
    // or two unisex seats
    if (s.unisex >= 2) { s.unisex -= 2; res.allocated_couples++; res.allocated_unisex += 2; return true; }
    // same-gender couple fallback (normally disabled)
    if (allowSameGenderCouple && s.male_only >= 2) { s.male_only -= 2; res.allocated_couples++; res.allocated_male += 2; return true; }
    if (allowSameGenderCouple && s.female_only >= 2) { s.female_only -= 2; res.allocated_couples++; res.allocated_female += 2; return true; }
    return false;
  };

  const tryAllocMale = () => {
    if (s.male_only > 0) { s.male_only--; res.allocated_male++; return true; }
    if (s.unisex > 0) { s.unisex--; res.allocated_unisex++; return true; }
    return false;
  };

  const tryAllocFemale = () => {
    if (s.female_only > 0) { s.female_only--; res.allocated_female++; return true; }
    if (s.unisex > 0) { s.unisex--; res.allocated_unisex++; return true; }
    return false;
  };

  if (together) {
    // must cover all
    let ok = true;
    for (let i=0;i<n.couples;i++) { if (!tryAllocCouple()) { ok = false; break; } }
    for (let i=0;i<n.males && ok;i++) { if (!tryAllocMale()) { ok = false; break; } }
    for (let i=0;i<n.females && ok;i++) { if (!tryAllocFemale()) { ok = false; break; } }
    if (!ok) return { ok: false };
    return { ok: true, res, seatsLeft: s };
  }

  // not together: allocate as much as possible
  while (n.couples > 0 && tryAllocCouple()) n.couples--;
  while (n.males > 0 && tryAllocMale()) n.males--;
  while (n.females > 0 && tryAllocFemale()) n.females--;
  const covered = (n.couples===0 && n.males===0 && n.females===0);
  return { ok: covered, partial: !covered, res, seatsLeft: s, remaining: n };
}

export async function matchNewOffer(offer, requests) {
  // requests should be sorted by created_at ASC (FIFO), filtered by direction and time window containment
  let seatsLeft = { male_only: offer.seats_male_only, female_only: offer.seats_female_only, unisex: offer.seats_unisex };
  const seatsLeftTotal = () => seatsLeft.male_only + seatsLeft.female_only + seatsLeft.unisex;
  const matches = [];
  
  logger.debug('Matching new offer with requests', {
    offerId: offer.id,
    seatsAvailable: {
      maleOnly: offer.seats_male_only,
      femaleOnly: offer.seats_female_only,
      unisex: offer.seats_unisex
    },
    requestCount: requests.length,
    direction: offer.direction,
    departureTime: offer.departure_time
  });
  
  for (const r of requests) {
    if (seatsLeftTotal() <= 0) {
      logger.debug('No more seats left in offer', { offerId: offer.id });
      break;
    }
    
    const need = { couples: r.couples_count||0, males: r.passengers_male||0, females: r.passengers_female||0 };
    logger.debug('Checking request against offer', {
      offerId: offer.id,
      requestId: r.id,
      need,
      seatsLeft,
      together: r.together
    });
    
    const m = allocFromOffer(seatsLeft, need, false, r.together);
    
    if (r.together) {
      if (m.ok) {
        logger.debug('Found match for "together" request', { 
          offerId: offer.id, 
          requestId: r.id,
          allocation: m.res 
        });
        
        const created = await addMatch({ offer_id: offer.id, request_id: r.id, ...m.res, status: "pending" });
        logger.info('Created match for "together" request', { 
          matchId: created.id,
          offerId: offer.id, 
          requestId: r.id 
        });
        
        // notify rider (best-effort)
        const req = await getRequestById(r.id);
        if (req) {
          logger.debug('Attempting to notify rider of match', { 
            requestId: r.id, 
            riderPhone: req.rider_phone 
          });
          await ringbackRider(req.rider_phone);
        }
        
        seatsLeft = m.seatsLeft;
        matches.push(created);
        break; // for together, allocate to a single request only
      }
    } else {
      const allocatedCount = m.res.allocated_couples * 2 + m.res.allocated_male + m.res.allocated_female + m.res.allocated_unisex;
      if (allocatedCount > 0) {
        logger.debug('Found partial match for request', { 
          offerId: offer.id, 
          requestId: r.id,
          allocation: m.res,
          allocatedCount 
        });
        
        const created = await addMatch({ offer_id: offer.id, request_id: r.id, ...m.res, status: "pending" });
        logger.info('Created partial match for request', { 
          matchId: created.id,
          offerId: offer.id, 
          requestId: r.id,
          allocatedCount
        });
        
        const req = await getRequestById(r.id);
        if (req) {
          logger.debug('Attempting to notify rider of partial match', { 
            requestId: r.id, 
            riderPhone: req.rider_phone 
          });
          await ringbackRider(req.rider_phone);
        }
        
        seatsLeft = m.seatsLeft;
        matches.push(created);
      }
    }
  }
  
  logger.info('Completed matching offer with requests', {
    offerId: offer.id,
    totalMatches: matches.length,
    matchIds: matches.map(m => m.id)
  });
  
  return matches;
}

export async function matchNewRequest(request, offers) {
  // offers should be filtered by direction and overlapping time, sorted by departure_time asc (then created_at)
  let remaining = { couples: request.couples_count||0, males: request.passengers_male||0, females: request.passengers_female||0 };
  const remainingTotal = () => remaining.couples * 2 + remaining.males + remaining.females;
  const matches = [];
  
  logger.debug('Matching new request with offers', {
    requestId: request.id,
    need: {
      couples: request.couples_count||0,
      males: request.passengers_male||0,
      females: request.passengers_female||0
    },
    offerCount: offers.length,
    direction: request.direction,
    timeWindow: {
      earliest: request.earliest_time,
      latest: request.latest_time,
      preferred: request.preferred_time
    }
  });
  
  // Sort offers by time preference if rider has set a preferred time
  if (request.preferred_time) {
    const preferredTime = new Date(request.preferred_time);
    logger.debug('Sorting offers by proximity to preferred time', {
      requestId: request.id,
      preferredTime
    });
    
    offers.sort((a, b) => {
      const timeA = new Date(a.departure_time);
      const timeB = new Date(b.departure_time);
      const diffA = Math.abs(timeA - preferredTime);
      const diffB = Math.abs(timeB - preferredTime);
      return diffA - diffB; // Sort by closest to preferred time
    });
  }
  
  for (const o of offers) {
    if (remainingTotal() <= 0) {
      logger.debug('Request fully satisfied, stopping offer search', { requestId: request.id });
      break;
    }
    
    const seats = { male_only: o.seats_male_only, female_only: o.seats_female_only, unisex: o.seats_unisex };
    logger.debug('Checking offer against request', {
      requestId: request.id,
      offerId: o.id,
      need: remaining,
      availableSeats: seats,
      together: request.together,
      departureTime: o.departure_time
    });
    
    const m = allocFromOffer(seats, remaining, false, request.together);
    
    if (request.together) {
      if (m.ok) {
        logger.debug('Found match for "together" request', {
          requestId: request.id,
          offerId: o.id,
          allocation: m.res
        });
        
        const created = await addMatch({ offer_id: o.id, request_id: request.id, ...m.res, status: "pending" });
        logger.info('Created match for "together" request', {
          matchId: created.id,
          requestId: request.id,
          offerId: o.id
        });
        
        // Notify driver instead of rider
        const offerObj = await getOfferById(o.id);
        if (offerObj) {
          logger.debug('Attempting to notify driver of match', {
            offerId: o.id,
            driverPhone: offerObj.driver_phone
          });
          await ringbackDriver(offerObj.driver_phone);
        }
        
        matches.push(created);
        break; // fully satisfied by this offer
      }
    } else {
      const allocatedCount = m.res.allocated_couples * 2 + m.res.allocated_male + m.res.allocated_female + m.res.allocated_unisex;
      if (allocatedCount > 0) {
        logger.debug('Found partial match for request', {
          requestId: request.id,
          offerId: o.id,
          allocation: m.res,
          allocatedCount
        });
        
        const created = await addMatch({ offer_id: o.id, request_id: request.id, ...m.res, status: "pending" });
        logger.info('Created partial match for request', {
          matchId: created.id,
          requestId: request.id,
          offerId: o.id,
          allocatedCount
        });
        
        // Notify driver instead of rider
        const offerObj = await getOfferById(o.id);
        if (offerObj) {
          logger.debug('Attempting to notify driver of match', {
            offerId: o.id,
            driverPhone: offerObj.driver_phone
          });
          await ringbackDriver(offerObj.driver_phone);
        }
        
        // update remaining according to what was allocated
        remaining = m.remaining;
        matches.push(created);
      }
    }
  }
  
  logger.info('Completed matching request with offers', {
    requestId: request.id,
    totalMatches: matches.length,
    matchIds: matches.map(m => m.id),
    remainingNeeds: remaining
  });
  
  return matches;
}

import { DateTime } from 'luxon';

let nextId = 1;

export const db = {
  users: new Map(), // phone -> { phone, name, is_allowed, declared_gender }
  offers: [],
  requests: [],
  matches: [],
};

export function upsertUser(user) {
  const existing = db.users.get(user.phone) || {};
  // Generate an ID if not exists (for consistency with MongoDB version)
  if (!existing.id) {
    existing.id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  const merged = { name: '', is_allowed: true, ...existing, ...user };
  db.users.set(merged.phone, merged);
  return merged;
}

export function isAllowed(phone) {
  if (process.env.ALLOW_ALL_CALLERS === 'true') return true;
  const u = db.users.get(phone);
  return !!(u && u.is_allowed);
}

export function addOffer(offer) {
  const id = nextId++;
  const now = DateTime.utc().toISO();
  const rec = { id, status: 'active', created_at: now, ...offer };
  // Ensure user_id is included if provided
  if (offer.user_id) {
    rec.user_id = offer.user_id;
  }
  db.offers.push(rec);
  return rec;
}

export function addRequest(request) {
  const id = nextId++;
  const now = DateTime.utc().toISO();
  const rec = { id, status: 'open', created_at: now, ...request };
  // Ensure user_id is included if provided
  if (request.user_id) {
    rec.user_id = request.user_id;
  }
  db.requests.push(rec);
  return rec;
}

export function addMatch(match) {
  const id = nextId++;
  const now = DateTime.utc().toISO();
  const rec = { id, status: 'pending', created_at: now, updated_at: now, ...match };
  db.matches.push(rec);
  return rec;
}

export function listPendingMatchesForPhone(phone) {
  // Find requests by this rider and active matches
  const reqIds = db.requests.filter(r => r.rider_phone === phone && ['open','partial','matched'].includes(r.status)).map(r => r.id);
  return db.matches.filter(m => reqIds.includes(m.request_id) && ['pending','notified','connected'].includes(m.status));
}

export function getActiveOffersForDateDirection(dateStartUtcISO, dateEndUtcISO, direction) {
  const start = DateTime.fromISO(dateStartUtcISO);
  const end = DateTime.fromISO(dateEndUtcISO);
  return db.offers.filter(o => o.status === 'active' && o.direction === direction)
    .filter(o => {
      const dt = DateTime.fromISO(o.departure_time);
      return dt >= start && dt <= end;
    })
    .sort((a,b) => a.departure_time.localeCompare(b.departure_time) || a.created_at.localeCompare(b.created_at));
}

export function getOfferById(id) { return db.offers.find(o => o.id === id) || null; }
export function getRequestById(id) { return db.requests.find(r => r.id === id) || null; }

export function getUserById(id) {
  // In store.js, users are stored in a Map with phone as key, not by ID
  // This is a limitation of the in-memory store
  for (const user of db.users.values()) {
    if (user.id === id) return user;
  }
  return null;
}

export function getUserByPhone(phone) {
  return db.users.get(phone) || null;
}

export function getOfferWithUser(id) {
  const offer = getOfferById(id);
  if (!offer) return null;
  
  if (offer.user_id) {
    const user = getUserById(offer.user_id);
    if (user) {
      return { ...offer, user };
    }
  }
  
  return offer;
}

export function getRequestWithUser(id) {
  const request = getRequestById(id);
  if (!request) return null;
  
  if (request.user_id) {
    const user = getUserById(request.user_id);
    if (user) {
      return { ...request, user };
    }
  }
  
  return request;
}

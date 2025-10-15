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
  db.offers.push(rec);
  return rec;
}

export function addRequest(request) {
  const id = nextId++;
  const now = DateTime.utc().toISO();
  const rec = { id, status: 'open', created_at: now, ...request };
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

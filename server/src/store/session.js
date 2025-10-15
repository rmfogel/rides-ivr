const SESSIONS = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getSession(callSid) {
  const s = SESSIONS.get(callSid);
  if (!s) return null;
  if (Date.now() - s.updatedAt > TTL_MS) {
    SESSIONS.delete(callSid);
    return null;
  }
  return s;
}

export function initSession(callSid, data = {}) {
  const s = { callSid, data, step: null, flow: null, createdAt: Date.now(), updatedAt: Date.now() };
  SESSIONS.set(callSid, s);
  return s;
}

export function patchSession(callSid, patch) {
  const s = getSession(callSid) || initSession(callSid);
  Object.assign(s, patch);
  s.updatedAt = Date.now();
  SESSIONS.set(callSid, s);
  return s;
}

export function clearSession(callSid) {
  SESSIONS.delete(callSid);
}

export function isDigits(str, min = 1, max = 10) {
  return typeof str === 'string' && /^\d+$/.test(str) && str.length >= min && str.length <= max;
}

export function toInt(str, def = 0) {
  const n = parseInt(str, 10);
  return Number.isNaN(n) ? def : n;
}

export function validatePassengerBreakdown(total, couples, males, females) {
  if (total <= 0) return false;
  if (couples < 0 || males < 0 || females < 0) return false;
  if (couples * 2 + males + females !== total) return false;
  return true;
}

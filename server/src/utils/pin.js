import bcrypt from 'bcrypt';
import logger from './logger.js';

const SALT_ROUNDS = 10;

/**
 * Hash a 4-digit PIN using bcrypt
 * @param {string} pin - Plain text 4-digit PIN
 * @returns {Promise<string>} Hashed PIN
 */
export async function hashPIN(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  
  try {
    const hash = await bcrypt.hash(pin, SALT_ROUNDS);
    logger.debug('PIN hashed successfully');
    return hash;
  } catch (err) {
    logger.error('Failed to hash PIN', {
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
}

/**
 * Verify a plain text PIN against a hashed PIN
 * @param {string} plainPin - Plain text 4-digit PIN to verify
 * @param {string} hashedPin - Hashed PIN from database
 * @returns {Promise<boolean>} True if PIN matches
 */
export async function verifyPIN(plainPin, hashedPin) {
  if (!plainPin || !hashedPin) {
    return false;
  }
  
  try {
    const isValid = await bcrypt.compare(plainPin, hashedPin);
    logger.debug('PIN verification result', { isValid });
    return isValid;
  } catch (err) {
    logger.error('Failed to verify PIN', {
      error: err.message,
      stack: err.stack
    });
    return false;
  }
}

/**
 * Validate PIN format (4 digits)
 * @param {string} pin - PIN to validate
 * @returns {boolean} True if valid format
 */
export function isValidPINFormat(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

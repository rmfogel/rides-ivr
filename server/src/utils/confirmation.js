// Confirmation details playback utilities
import { playPrompt, playDigits, playHHMM } from './recordings.js';

/**
 * Play phone number with Hebrew intro
 * @param {TwimlNode} twimlNode - Twilio TwiML node
 * @param {string} phone - Phone number to play
 * @param {string} lang - Language code (default: 'he')
 */
export function playPhoneNumber(twimlNode, phone, lang = 'he') {
  // Play "phone number is" message
  playPrompt(twimlNode, 'passenger_phone_number_is', lang);
  
  // Play each digit of the phone number
  playDigits(twimlNode, phone, lang);
}

/**
 * Play person's name in English
 * @param {TwimlNode} twimlNode - Twilio TwiML node
 * @param {string} name - Name to say in English
 */
export function playNameInEnglish(twimlNode, name) {
  if (name && name.trim()) {
    // Use English TTS for the name
    twimlNode.say({ voice: 'Polly.Joanna', language: 'en-US' }, name);
  }
}

/**
 * Play direction (FROM or TO settlement)
 * @param {TwimlNode} twimlNode - Twilio TwiML node
 * @param {string} direction - 'FROM' or 'TO'
 * @param {string} lang - Language code (default: 'he')
 */
export function playDirection(twimlNode, direction, lang = 'he') {
  if (direction === 'FROM') {
    playPrompt(twimlNode, 'direction_from_settlement', lang);
  } else if (direction === 'TO') {
    playPrompt(twimlNode, 'direction_to_settlement', lang);
  }
}

/**
 * Play time in HH:MM format
 * @param {TwimlNode} twimlNode - Twilio TwiML node
 * @param {string} time - Time string like "14:30" or "0945"
 * @param {string} lang - Language code (default: 'he')
 */
export function playTime(twimlNode, time, lang = 'he') {
  if (!time) return;
  
  // Convert "14:30" to "1430"
  const timeStr = time.replace(':', '');
  playHHMM(twimlNode, timeStr, lang);
}

/**
 * Play date in Hebrew format
 * @param {TwimlNode} twimlNode - Twilio TwiML node
 * @param {string} dateStr - Date string in ISO format
 * @param {string} lang - Language code (default: 'he')
 */
export function playDate(twimlNode, dateStr, lang = 'he') {
  // For now, we'll use TTS for dates since we don't have recordings for all possible dates
  // In the future, you could add recordings for days/months/years
  if (dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    
    // Play day
    playDigits(twimlNode, day.toString(), lang);
    
    // Play month (could add month name recordings later)
    playDigits(twimlNode, month.toString(), lang);
  }
}

/**
 * Play passenger count details
 * @param {TwimlNode} twimlNode - Twilio TwiML node
 * @param {Object} passengers - Passenger details
 * @param {number} passengers.male - Number of male passengers
 * @param {number} passengers.female - Number of female passengers
 * @param {number} passengers.couples - Number of couples
 * @param {string} lang - Language code (default: 'he')
 */
export function playPassengerDetails(twimlNode, passengers, lang = 'he') {
  const { male = 0, female = 0, couples = 0 } = passengers;
  const total = male + female;
  
  // Play total passengers
  playDigits(twimlNode, total.toString(), lang);
  playPrompt(twimlNode, 'passengers', lang);
  
  // Play male count
  if (male > 0) {
    playDigits(twimlNode, male.toString(), lang);
    playPrompt(twimlNode, 'males', lang);
  }
  
  // Play female count
  if (female > 0) {
    playDigits(twimlNode, female.toString(), lang);
    playPrompt(twimlNode, 'females', lang);
  }
  
  // Play couples count
  if (couples > 0) {
    playDigits(twimlNode, couples.toString(), lang);
    playPrompt(twimlNode, 'couples', lang);
  }
}

/**
 * Play seat availability details
 * @param {TwimlNode} twimlNode - Twilio TwiML node
 * @param {Object} seats - Seat details
 * @param {number} seats.total - Total seats
 * @param {number} seats.male - Male-only seats
 * @param {number} seats.female - Female-only seats
 * @param {number} seats.unisex - Unisex seats
 * @param {string} lang - Language code (default: 'he')
 */
export function playSeatDetails(twimlNode, seats, lang = 'he') {
  const { total = 0, male = 0, female = 0, unisex = 0 } = seats;
  
  // Play total seats
  playDigits(twimlNode, total.toString(), lang);
  playPrompt(twimlNode, 'seats_total', lang);
  
  // Play male-only seats
  if (male > 0) {
    playDigits(twimlNode, male.toString(), lang);
    playPrompt(twimlNode, 'seats_male_only', lang);
  }
  
  // Play female-only seats
  if (female > 0) {
    playDigits(twimlNode, female.toString(), lang);
    playPrompt(twimlNode, 'seats_female_only', lang);
  }
  
  // Play unisex seats
  if (unisex > 0) {
    playDigits(twimlNode, unisex.toString(), lang);
    playPrompt(twimlNode, 'seats_unisex', lang);
  }
}

export default {
  playPhoneNumber,
  playNameInEnglish,
  playDirection,
  playTime,
  playDate,
  playPassengerDetails,
  playSeatDetails
};

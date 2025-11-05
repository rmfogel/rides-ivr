import { Router } from 'express';
import twilio from 'twilio';
import { 
  addRequest, 
  addOffer, 
  listActiveOffersForRequest, 
  listOpenRequestsForOffer, 
  getOfferById, 
  getRequestById,
  getOfferWithUser,
  getRequestWithUser,
  getUserByPhone, 
  updateMatchStatus,
  listPendingMatchesForPhone,
  listPendingMatchesForDriverPhone,
  checkUserExists,
  saveNameRecording,
  savePIN,
  updatePIN,
  getUserPIN
} from '../db/repo.js';
import { matchNewOffer, matchNewRequest } from '../engine/matching.js';
import { DateTime } from 'luxon';
import { TZ } from '../utils/time.js';
import { playPrompt, playDigits, playHHMM } from '../utils/recordings.js';
import { hashPIN, verifyPIN, isValidPINFormat } from '../utils/pin.js';
import logger from '../utils/logger.js';
import { DEFAULT_LANGUAGE } from '../config/language.js';

export const voiceRouter = Router();

/**
 * Normalize phone number for Israeli system
 * - Removes all non-digit and non-+ characters
 * - Converts +972 to 0 (Israeli format)
 * - Keeps other international formats as-is
 */
function normalizeIsraeliPhone(phone) {
  if (!phone) return '';
  // Remove all non-digit and non-+ characters
  let cleaned = phone.replace(/[^+\d]/g, '');
  // Convert +972 to 0 for Israeli numbers
  if (cleaned.startsWith('+972')) {
    cleaned = '0' + cleaned.substring(4);
  }
  logger.debug('Normalized phone number', { original: phone, cleaned, cleanedLength: cleaned.length });
  return cleaned;
}

/**
 * Play user's full name - use recorded name if available, otherwise fallback to TTS
 * @param {object} twimlNode - The TwiML node to add the name playback to
 * @param {object} user - User object with name_recording_url, fullName or name property
 * @param {string} role - 'driver' or 'rider' for logging purposes
 */
function playFullName(twimlNode, user, role = 'user') {
  if (!user) {
    logger.debug(`No user object provided for ${role}, skipping name playback`);
    return;
  }
  
  try {
    // Priority 1: Use recorded name if available
    if (user.name_recording_url) {
      logger.debug(`Playing recorded name for ${role}`, { 
        userId: user.id, 
        recordingUrl: user.name_recording_url 
      });
      twimlNode.play(user.name_recording_url);
      return;
    }
    
    // Priority 2: Fallback to TTS with text name
    const fullName = user.fullName || user.name;
    
    if (!fullName || fullName.trim() === '') {
      logger.debug(`No name found for ${role}, skipping name playback`, { userId: user.id });
      return;
    }
    
    // Use Polly Joanna (English female voice) - works better for reading Hebrew names
    twimlNode.say({ 
      voice: 'Polly.Joanna',
      language: 'en-US'
    }, fullName);
    
    logger.debug(`Playing TTS name for ${role}`, { name: fullName, userId: user.id });
  } catch (error) {
    logger.error(`Error playing name for ${role}`, { 
      error: error.message, 
      hasRecording: !!user.name_recording_url,
      name: user.fullName || user.name 
    });
  }
}

// Ensure TwiML is always served with UTF-8 charset so Hebrew characters are valid
voiceRouter.use((req, res, next) => {
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    const ct = res.get('Content-Type') || '';
    if (!ct || ct.startsWith('text/xml')) {
      res.set('Content-Type', 'text/xml; charset=utf-8');
    }
    return originalSend(body);
  };
  next();
});

// Entry point for calls
voiceRouter.post('/incoming', async (req, res) => {
  const phone = normalizeIsraeliPhone(req.body.From);
  // Set session language based on query param if provided, default to Hebrew
  const language = req.query.lang || DEFAULT_LANGUAGE;
  
  // Store language preference in session for future requests
  if (!req.session) {
    req.session = {};
  }
  req.session.language = language;
  req.session.phone = phone;
  
  logger.info('Incoming call received', {
    from: phone,
    callSid: req.body.CallSid,
    callStatus: req.body.CallStatus,
    language
  });
  
  try {
    // Check if user exists and is registered via IVR
    const userExists = await checkUserExists(phone);
    const user = userExists ? await getUserByPhone(phone) : null;
    
    const twiml = new twilio.twiml.VoiceResponse();
    
    // If user doesn't exist or hasn't completed IVR registration, redirect to registration
    if (!userExists || !user || !user.registered_via_ivr) {
      logger.info('New user or incomplete registration, redirecting to registration', {
        phone,
        userExists,
        hasUser: !!user,
        registeredViaIVR: user?.registered_via_ivr
      });
      
      twiml.redirect(`/voice/register/welcome?lang=${language}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // User is registered, proceed to main menu
    playPrompt(twiml, 'welcome');
    
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 6,
      action: `/voice/menu?lang=${language}`
    });
    playPrompt(gather, 'main_menu');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    logger.error('Error in incoming call handler', {
      error: err.message,
      stack: err.stack,
      phone
    });
    
    const twiml = new twilio.twiml.VoiceResponse();
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// Main menu handler
voiceRouter.post('/menu', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  // Get language preference from query param or session
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const isHebrew = language === 'he';
  
  logger.debug('Menu selection', {
    digits: Digits,
    language
  });
  
  if (Digits === '1') {
    twiml.redirect(`/voice/driver?lang=${language}`);
  } else if (Digits === '2') {
    twiml.redirect(`/voice/rider?lang=${language}`);
  } else if (Digits === '3') {
    twiml.redirect(`/voice/manage?lang=${language}`);
  } else if (Digits === '4') {
    // Reset PIN option
    twiml.redirect(`/voice/register/reset-pin?lang=${language}`);
  } else {
    playPrompt(twiml, 'invalid_input');
    twiml.hangup();
  }
  res.type('text/xml').send(twiml.toString());
});

// Basic rider menu - redirect directly to new ride request
voiceRouter.post('/rider', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  // Get language preference
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  
  // Go directly to ride request flow
  twiml.redirect(`/voice/rider-new?lang=${language}`);
  
  res.type('text/xml').send(twiml.toString());
});

// Start ride request flow
voiceRouter.post('/rider-new', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  
  // Store phone in session
  req.session = req.session || {};
  req.session.phone = from;
  
  // Step 1: Ask for direction
  playPrompt(twiml, 'start_rider_request');
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 6,
    action: '/voice/rider-direction'
  });
  playPrompt(gather, 'direction_prompt');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle ride direction
voiceRouter.post('/rider-direction', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  
  req.session = req.session || {};
  
  if (Digits === '1') {
    req.session.direction = 'FROM';
    twiml.redirect('/voice/rider-date?dir=FROM');
  } else if (Digits === '2') {
    req.session.direction = 'TO';
    twiml.redirect('/voice/rider-date?dir=TO');
  } else {
    // Clear error message and retry
    playPrompt(twiml, 'invalid_direction_retry');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 6,
      action: '/voice/rider-direction'
    });
    playPrompt(gather, 'direction_prompt');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Ask for ride date
voiceRouter.post('/rider-date', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Get direction from query params or session
  const direction = req.query.dir || (req.session && req.session.direction) || '';
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 6,
    action: `/voice/rider-date-choice?dir=${direction}`
  });
  playPrompt(gather, 'date_choice_prompt');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle date choice
voiceRouter.post('/rider-date-choice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  // Get direction from query params
  const direction = req.query.dir || req.session.direction || '';
  req.session.direction = direction;
  
  if (Digits === '1' || Digits === '2') {
    // Today or tomorrow
    try {
      const now = DateTime.now().setZone(TZ);
      const date = Digits === '1' ? now : now.plus({ days: 1 });
      req.session.rideDate = date.toISODate();
      twiml.redirect(`/voice/rider-time?date=${date.toISODate()}&dir=${direction}`);
    } catch (error) {
      console.error('Error setting date:', error);
      playPrompt(twiml, 'error_generic_try_later');
      twiml.redirect(`/voice/rider-date?dir=${direction}`);
    }
  } else if (Digits === '3') {
    // Custom date
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 6,
      timeout: 15,
      action: `/voice/rider-custom-date?dir=${direction}`
    });
    playPrompt(gather, 'enter_date_six_digits');
    playPrompt(twiml, 'invalid_date_try_again');
    twiml.redirect(`/voice/rider-date?dir=${direction}`);
  } else {
    // Invalid choice - retry with clear message
    playPrompt(twiml, 'invalid_date_option_retry');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 6,
      action: `/voice/rider-date-choice?dir=${direction}`
    });
    playPrompt(gather, 'date_choice_prompt');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle custom date entry
voiceRouter.post('/rider-custom-date', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  // Get direction from query params
  const direction = req.query.dir || req.session.direction || '';
  req.session.direction = direction;
  
  try {
    if (!/^\d{6}$/.test(Digits)) throw new Error('Invalid date format');
    
    const day = parseInt(Digits.substring(0, 2), 10);
    const month = parseInt(Digits.substring(2, 4), 10);
    const year = 2000 + parseInt(Digits.substring(4, 6), 10);
    
    // Validate date
    const date = DateTime.fromObject({ day, month, year }, { zone: TZ });
    if (!date.isValid) throw new Error('Invalid date');
    
    // Check that date is not in the past
    const now = DateTime.now().setZone(TZ).startOf('day');
    if (date < now) throw new Error('Date is in the past');
    
    req.session.rideDate = date.toISODate();
    twiml.redirect(`/voice/rider-time?date=${date.toISODate()}&dir=${direction}`);
  } catch (error) {
    console.error('Error processing custom date:', error);
    playPrompt(twiml, 'invalid_date_try_again');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 6,
      timeout: 15,
      action: `/voice/rider-custom-date?dir=${direction}`
    });
    playPrompt(gather, 'enter_date_six_digits');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Ask for earliest time
voiceRouter.post('/rider-time', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 4,
    timeout: 15,
    action: `/voice/rider-earliest-time?date=${date}&dir=${direction}`
  });
  playPrompt(gather, 'time_enter_earliest');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle earliest time and ask for latest time
voiceRouter.post('/rider-earliest-time', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  
  try {
    if (!/^\d{4}$/.test(Digits)) throw new Error('Invalid time format');
    
    const hours = parseInt(Digits.substring(0, 2), 10);
    const minutes = parseInt(Digits.substring(2, 4), 10);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('Invalid time values');
    }
    
    // Store time in session
    req.session.earliestTime = { hours, minutes };
    
    // Pass earliest time as query parameters to next step
    const earliestTimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 4,
      timeout: 15,
      action: `/voice/rider-latest-time?earliest=${earliestTimeStr}&date=${date}&dir=${direction}`
    });
    playPrompt(gather, 'time_enter_latest');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  } catch (error) {
    console.error('Error processing earliest time:', error);
    playPrompt(twiml, 'invalid_time_format');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 4,
      timeout: 15,
      action: `/voice/rider-earliest-time?date=${date}&dir=${direction}`
    });
    playPrompt(gather, 'time_enter_earliest');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle latest time and ask for preferred time
voiceRouter.post('/rider-latest-time', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  try {
    if (!/^\d{4}$/.test(Digits)) throw new Error('Invalid time format');
    
    const hours = parseInt(Digits.substring(0, 2), 10);
    const minutes = parseInt(Digits.substring(2, 4), 10);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('Invalid time values');
    }
    
    // Get earliest time from query params (more reliable than session in Twilio)
    const earliestTimeStr = req.query.earliest;
    if (!earliestTimeStr || earliestTimeStr.length !== 5) {
      logger.error('Earliest time not found in query params');
      playPrompt(twiml, 'session_expired_restart');
      twiml.redirect('/voice/rider-new');
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Parse earliest time from query string (format: HH:MM)
    const [earliestHoursStr, earliestMinutesStr] = earliestTimeStr.split(':');
    const earliestHours = parseInt(earliestHoursStr, 10);
    const earliestMinutes = parseInt(earliestMinutesStr, 10);
    
    // Also restore session data
    req.session.earliestTime = { hours: earliestHours, minutes: earliestMinutes };
    req.session.rideDate = req.query.date;
    req.session.direction = req.query.dir;
    
    if ((hours < earliestHours) || (hours === earliestHours && minutes < earliestMinutes)) {
      logger.info('Latest time validation failed', {
        latest: `${hours}:${minutes}`,
        earliest: `${earliestHours}:${earliestMinutes}`
      });
      playPrompt(twiml, 'time_must_be_later');
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 4,
        timeout: 15,
        action: `/voice/rider-latest-time?earliest=${earliestTimeStr}&date=${req.query.date}&dir=${req.query.dir}`
      });
      playPrompt(gather, 'time_enter_latest');
      playPrompt(twiml, 'no_input_goodbye');
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Store time in session
    req.session.latestTime = { hours, minutes };
    
    const date = req.query.date || req.session.rideDate || '';
    const direction = req.query.dir || req.session.direction || '';
    const earliestTimeQuery = req.query.earliest || '';
    const latestTimeQuery = `${hours}:${minutes}`;
    
    // If earliest and latest times are the same, skip preferred time and go straight to passengers
    if (hours === earliestHours && minutes === earliestMinutes) {
      logger.debug('Earliest and latest times are the same, skipping preferred time');
      twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliestTimeQuery}&latest=${latestTimeQuery}`);
    } else {
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 1,
        timeout: 10,
        action: `/voice/rider-preferred-time?date=${date}&dir=${direction}&earliest=${earliestTimeQuery}&latest=${latestTimeQuery}`
      });
      playPrompt(gather, 'preferred_time_question');
      playPrompt(twiml, 'continue_without_preferred');
      twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliestTimeQuery}&latest=${latestTimeQuery}`);
    }
  } catch (error) {
    logger.error('Error processing latest time:', error);
    const date = req.query.date || '';
    const direction = req.query.dir || '';
    const earliestTimeQuery = req.query.earliest || '';
    playPrompt(twiml, 'invalid_time_format');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 4,
      timeout: 15,
      action: `/voice/rider-latest-time?earliest=${earliestTimeQuery}&date=${date}&dir=${direction}`
    });
    playPrompt(gather, 'time_enter_latest');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle preferred time choice
voiceRouter.post('/rider-preferred-time', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  
  if (Digits === '1') {
    // User wants to enter preferred time
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 4,
      timeout: 15,
      action: `/voice/rider-preferred-time-entry?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}`
    });
    playPrompt(gather, 'preferred_time_enter');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}`);
  } else {
    // No preferred time or chose not to enter one
    twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}`);
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle preferred time entry
voiceRouter.post('/rider-preferred-time-entry', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  
  try {
    if (!/^\d{4}$/.test(Digits)) throw new Error('Invalid time format');
    
    const hours = parseInt(Digits.substring(0, 2), 10);
    const minutes = parseInt(Digits.substring(2, 4), 10);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('Invalid time values');
    }
    
    // Make sure preferred time is within the earliest and latest time range
    // Parse times from query params (format: HH:MM)
    const [earliestHoursStr, earliestMinutesStr] = (earliest || '').split(':');
    const [latestHoursStr, latestMinutesStr] = (latest || '').split(':');
    const earliestHours = parseInt(earliestHoursStr, 10);
    const earliestMinutes = parseInt(earliestMinutesStr, 10);
    const latestHours = parseInt(latestHoursStr, 10);
    const latestMinutes = parseInt(latestMinutesStr, 10);
    
    const isBefore = (hours < earliestHours) || (hours === earliestHours && minutes < earliestMinutes);
    const isAfter = (hours > latestHours) || (hours === latestHours && minutes > latestMinutes);
    
    if (isBefore || isAfter) {
      playPrompt(twiml, 'time_outside_range');
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 4,
        timeout: 15,
        action: `/voice/rider-preferred-time-entry?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}`
      });
      playPrompt(gather, 'preferred_time_enter');
      playPrompt(twiml, 'continue_without_preferred');
      twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Store time in session
    req.session.preferredTime = { hours, minutes };
    const preferred = `${hours}:${minutes}`;
    twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}`);
  } catch (error) {
    console.error('Error processing preferred time:', error);
    playPrompt(twiml, 'invalid_time_format');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}`);
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Ask for passenger count and details
voiceRouter.post('/rider-passengers', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/rider-male-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}`
  });
  playPrompt(gather, 'passenger_details_intro');
  playPrompt(gather, 'how_many_males');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle male passenger count and ask for female count
voiceRouter.post('/rider-male-count', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  
  // Validate input is a single digit
  if (!/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-male-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}`
    });
    playPrompt(gather, 'how_many_males');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store male passenger count
  const maleCount = parseInt(Digits, 10);
  req.session.maleCount = maleCount;
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/rider-female-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}`
  });
  playPrompt(gather, 'how_many_females');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle female passenger count and ask for couples count
voiceRouter.post('/rider-female-count', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  const maleCount = parseInt(req.query.male) || req.session.maleCount || 0;
  
  // Validate input is a single digit
  if (!/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-female-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}`
    });
    playPrompt(gather, 'how_many_females');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store female passenger count
  const femaleCount = parseInt(Digits, 10);
  req.session.femaleCount = femaleCount;
  
  // Ask about children count
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/rider-children-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}`
  });
  playPrompt(gather, 'how_many_children');
  playPrompt(twiml, 'continue_without_preferred');
  twiml.redirect(`/voice/rider-children-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&Digits=0`);
  
  res.type('text/xml').send(twiml.toString());
});

// Handle children count
voiceRouter.post('/rider-children-count', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  const maleCount = parseInt(req.query.male) || req.session.maleCount || 0;
  const femaleCount = parseInt(req.query.female) || req.session.femaleCount || 0;
  
  // Validate input is a single digit
  if (!/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-children-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}`
    });
    playPrompt(gather, 'how_many_children');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-couples-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=0`);
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store children count
  const childrenCount = parseInt(Digits, 10);
  req.session.childrenCount = childrenCount;
  
  // Calculate total passengers
  const totalCount = maleCount + femaleCount;
  
  if (totalCount === 0 && childrenCount === 0) {
    playPrompt(twiml, 'need_at_least_one_passenger');
    twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}`);
  } else if (totalCount >= 2) {
    // Ask about couples if there are at least 2 adults
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-couples-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}`
    });
    playPrompt(gather, 'couples_how_many');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=0`);
  } else {
    // Only one adult or only children, no couples
    req.session.couplesCount = 0;
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=0`);
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle couples count and ask if they must travel together
voiceRouter.post('/rider-couples-count', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  const maleCount = parseInt(req.query.male) || req.session.maleCount || 0;
  const femaleCount = parseInt(req.query.female) || req.session.femaleCount || 0;
  const childrenCount = parseInt(req.query.children) || req.session.childrenCount || 0;
  
  // Validate input is a single digit
  if (!/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-couples-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}`
    });
    playPrompt(gather, 'couples_how_many');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=0`);
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store couples count
  const couplesCount = parseInt(Digits, 10);
  const totalCount = maleCount + femaleCount;
  
  // Validate couples count
  if (couplesCount * 2 > totalCount) {
    playPrompt(twiml, 'too_many_couples');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-couples-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}`
    });
    playPrompt(gather, 'couples_how_many');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=0`);
  } else {
    req.session.couplesCount = couplesCount;
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=${couplesCount}`);
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Ask if all passengers must travel together
voiceRouter.post('/rider-together', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  const maleCount = parseInt(req.query.male) || req.session.maleCount || 0;
  const femaleCount = parseInt(req.query.female) || req.session.femaleCount || 0;
  const childrenCount = parseInt(req.query.children) || req.session.childrenCount || 0;
  const couplesCount = parseInt(req.query.couples) || req.session.couplesCount || 0;
  const totalCount = maleCount + femaleCount;
  
  if (totalCount > 1) {
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-confirm?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=${couplesCount}`
    });
  playPrompt(gather, 'together_question');
  playPrompt(twiml, 'assuming_together');
    
    // Default to together if no input
    req.session.together = true;
    twiml.redirect(`/voice/rider-confirm?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=${couplesCount}&together=1`);
  } else {
    // Only one passenger, must travel together
    req.session.together = true;
    twiml.redirect(`/voice/rider-confirm?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=${couplesCount}&together=1`);
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Process "must travel together" choice and confirm details
voiceRouter.post('/rider-confirm', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  const maleCount = parseInt(req.query.male) || req.session.maleCount || 0;
  const femaleCount = parseInt(req.query.female) || req.session.femaleCount || 0;
  const childrenCount = parseInt(req.query.children) || req.session.childrenCount || 0;
  const couplesCount = parseInt(req.query.couples) || req.session.couplesCount || 0;
  const together = req.query.together === '1' || req.query.together === '2' ? req.query.together : '1';
  
  // Process "must travel together" input if it was provided
  if (Digits) {
    req.session.together = (Digits === '1');
  } else if (together) {
    req.session.together = (together === '1');
  }
  
  // Generate summary for confirmation
  const dateObj = DateTime.fromISO(date || req.session.rideDate).setZone(TZ);
  const dateStr = dateObj.toFormat('MMMM d, yyyy');
  
  const earlyTime = earliest || `${req.session.earliestTime.hours.toString().padStart(2, '0')}:${req.session.earliestTime.minutes.toString().padStart(2, '0')}`;
  const lateTime = latest || `${req.session.latestTime.hours.toString().padStart(2, '0')}:${req.session.latestTime.minutes.toString().padStart(2, '0')}`;
  
  let preferredTimeStr = '';
  if (preferred || req.session.preferredTime) {
    const prefTime = preferred || `${req.session.preferredTime.hours.toString().padStart(2, '0')}:${req.session.preferredTime.minutes.toString().padStart(2, '0')}`;
    preferredTimeStr = ` with preferred time of ${prefTime}`;
  }
  
  const totalCount = maleCount + femaleCount;
  
  // Play confirmation intro
  playPrompt(twiml, 'confirm_request_intro');
  
  // Play ride details using recordings
  // Direction
  if (direction === 'FROM') {
    playPrompt(twiml, 'from_settlement');
  } else {
    playPrompt(twiml, 'to_settlement');
  }
  
  // Time range - play earliest to latest
  if (earliest) {
    const earliestStr = earliest.replace(':', '');
    playHHMM(twiml, earliestStr);
    const latestStr = latest.replace(':', '');
    playHHMM(twiml, latestStr);
  }
  
  // Passengers - play total count (adults + children)
  const totalWithChildren = totalCount + childrenCount;
  playDigits(twiml, totalWithChildren.toString());
  playPrompt(twiml, 'passengers');
  
  // If there are children, mention them specifically
  if (childrenCount > 0) {
    playPrompt(twiml, 'including');
    playDigits(twiml, childrenCount.toString());
    playPrompt(twiml, 'children');
  }
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/rider-submit?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&children=${childrenCount}&couples=${couplesCount}&together=${together}`
  });
  playPrompt(gather, 'press_1_confirm_2_restart');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Submit the ride request to the database
voiceRouter.post('/rider-submit', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const earliest = req.query.earliest || '';
  const latest = req.query.latest || '';
  const preferred = req.query.preferred || '';
  const maleCount = parseInt(req.query.male) || req.session.maleCount || 0;
  const femaleCount = parseInt(req.query.female) || req.session.femaleCount || 0;
  const childrenCount = parseInt(req.query.children) || req.session.childrenCount || 0;
  const couplesCount = parseInt(req.query.couples) || req.session.couplesCount || 0;
  const together = req.query.together === '1';
  
  if (Digits === '1') {
    try {
      const from = req.session.phone || normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
      
      logger.info('Rider submit - phone number', { from, fromLength: from?.length, sessionPhone: req.session.phone });
      
      // Validate required params
      if (!date || !direction || !earliest || !latest) {
        logger.error('Missing required parameters in rider-submit', {
          date,
          direction,
          earliest,
          latest,
          queryParams: req.query
        });
        playPrompt(twiml, 'session_expired_restart');
        twiml.redirect('/voice/rider-new');
        res.type('text/xml').send(twiml.toString());
        return;
      }
      
      // Create date objects
      const rideDate = DateTime.fromISO(date).setZone(TZ);
      
      if (!rideDate.isValid) {
        logger.error('Invalid date in rider-submit', { date, rideDate });
        playPrompt(twiml, 'session_expired_restart');
        twiml.redirect('/voice/rider-new');
        res.type('text/xml').send(twiml.toString());
        return;
      }
      
      // Parse earliest time
      let earliestHours, earliestMinutes;
      if (earliest && earliest.includes(':')) {
        [earliestHours, earliestMinutes] = earliest.split(':').map(t => parseInt(t, 10));
      } else {
        earliestHours = req.session.earliestTime?.hours || 0;
        earliestMinutes = req.session.earliestTime?.minutes || 0;
      }
      
      const earliestDateTime = rideDate.set({
        hour: earliestHours,
        minute: earliestMinutes,
        second: 0,
        millisecond: 0
      });
      
      // Parse latest time
      let latestHours, latestMinutes;
      if (latest && latest.includes(':')) {
        [latestHours, latestMinutes] = latest.split(':').map(t => parseInt(t, 10));
      } else {
        latestHours = req.session.latestTime?.hours || 0;
        latestMinutes = req.session.latestTime?.minutes || 0;
      }
      
      const latestDateTime = rideDate.set({
        hour: latestHours,
        minute: latestMinutes,
        second: 0,
        millisecond: 0
      });
      
      // Parse preferred time if exists
      let preferredDateTime = null;
      if (preferred && preferred.includes(':')) {
        const [preferredHours, preferredMinutes] = preferred.split(':').map(t => parseInt(t, 10));
        preferredDateTime = rideDate.set({
          hour: preferredHours,
          minute: preferredMinutes,
          second: 0,
          millisecond: 0
        });
      } else if (req.session.preferredTime) {
        preferredDateTime = rideDate.set({
          hour: req.session.preferredTime.hours,
          minute: req.session.preferredTime.minutes,
          second: 0,
          millisecond: 0
        });
      }
      
      // Get or create user to link to the request
      const user = await getUserByPhone(from);
      
      // Create the ride request
      const rideRequest = {
        rider_phone: from,
        direction: direction,
        earliest_time: earliestDateTime.toJSDate(),
        latest_time: latestDateTime.toJSDate(),
        passengers_male: maleCount,
        passengers_female: femaleCount,
        children_count: childrenCount,
        passengers_total: maleCount + femaleCount + childrenCount,
        couples_count: couplesCount,
        together: together || req.session.together
      };
      
      // Link to user if exists
      if (user && user.id) {
        rideRequest.user_id = user.id;
      }
      
      if (preferredDateTime) {
        rideRequest.preferred_time = preferredDateTime.toJSDate();
      }
      
      // Add the request to the database
      const createdRequest = await addRequest(rideRequest);
      
      // Find matching offers
      const offers = await listActiveOffersForRequest(createdRequest);
      const matches = await matchNewRequest(createdRequest, offers);
      
      // Provide immediate feedback
      if (matches.length > 0) {
        // Get the best match (first one returned by the matching algorithm)
        const bestMatch = matches[0];
        
        // Get the offer details with full user information
        const matchedOffer = await getOfferWithUser(bestMatch.offer_id);
        
        // Get driver information from the user object or fallback to phone lookup
        let driverInfo = "an unknown driver";
        let driverPhone = matchedOffer.driver_phone;
        let driverName = null;
        
        // Prefer user object data if available
        if (matchedOffer.user) {
          driverName = matchedOffer.user.name;
          // Always use the user's registered phone number when available
          if (matchedOffer.user.phone) {
            driverPhone = matchedOffer.user.phone;
          }
        } else {
          // Fallback to separate query if user not populated
          const driver = await getUserByPhone(driverPhone);
          if (driver && driver.name) {
            driverName = driver.name;
          }
          if (driver && driver.phone) {
            driverPhone = driver.phone;
          }
        }
        
        if (driverName) {
          driverInfo = driverName;
        }
        
        // Format the departure time
        const departureTime = DateTime.fromJSDate(matchedOffer.departure_time).setZone(TZ);
        const timeStr = departureTime.toFormat('HH:mm');
        
        // Tell the rider about the match
        playPrompt(twiml, 'great_news_found_ride');
        
        // Play driver's full name in Hebrew if available
        if (matchedOffer.user) {
          playFullName(twiml, matchedOffer.user, 'driver');
        }
        
        // Read out the phone number digit by digit
        logger.info('Playing driver phone number', { driverPhone, driverPhoneLength: driverPhone?.length });
        playPrompt(twiml, 'driver_phone_number_is');
        playDigits(twiml, driverPhone);
        
        // Ask if they want this ride
        const gather = twiml.gather({
          input: 'dtmf',
          numDigits: 1,
          timeout: 10,
          action: `/voice/rider-confirm-match?match_id=${bestMatch.id}&offer_id=${matchedOffer.id}`
        });
        playPrompt(gather, 'press_1_accept_2_decline');
        playPrompt(twiml, 'request_registered_keep_active');
        twiml.hangup();
      } else {
        playPrompt(twiml, 'request_registered');
        playPrompt(twiml, 'thanks_goodbye');
        twiml.hangup();
      }
    } catch (error) {
      console.error('Error creating ride request:', error);
      playPrompt(twiml, 'error_generic_try_later');
      twiml.hangup();
    }
  } else {
    playPrompt(twiml, 'start_over');
    twiml.redirect('/voice/rider-new');
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Basic driver menu
voiceRouter.post('/driver', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  // Get language preference
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  
  // Go directly to ride offer flow
  twiml.redirect(`/voice/driver-new?lang=${language}`);
  
  res.type('text/xml').send(twiml.toString());
});

// Start ride offer flow
voiceRouter.post('/driver-new', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  
  // Store phone in session
  req.session = req.session || {};
  req.session.phone = from;
  
  // Step 1: Ask for direction
  playPrompt(twiml, 'start_driver_offer');
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 6,
    action: '/voice/driver-direction'
  });
  playPrompt(gather, 'direction_prompt');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle ride direction
voiceRouter.post('/driver-direction', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  
  req.session = req.session || {};
  
  if (Digits === '1') {
    req.session.direction = 'FROM';
    twiml.redirect('/voice/driver-date?dir=FROM');
  } else if (Digits === '2') {
    req.session.direction = 'TO';
    twiml.redirect('/voice/driver-date?dir=TO');
  } else {
    // Clear error message and retry
    playPrompt(twiml, 'invalid_direction_retry');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 6,
      action: '/voice/driver-direction'
    });
    playPrompt(gather, 'direction_prompt');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Ask for ride date
voiceRouter.post('/driver-date', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Get direction from query params or session
  const direction = req.query.dir || (req.session && req.session.direction) || '';
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 6,
    action: `/voice/driver-date-choice?dir=${direction}`
  });
  playPrompt(gather, 'date_choice_prompt');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle date choice
voiceRouter.post('/driver-date-choice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  // Get direction from query params
  const direction = req.query.dir || req.session.direction || '';
  req.session.direction = direction;
  
  if (Digits === '1' || Digits === '2') {
    // Today or tomorrow
    try {
      const now = DateTime.now().setZone(TZ);
      const date = Digits === '1' ? now : now.plus({ days: 1 });
      req.session.rideDate = date.toISODate();
      twiml.redirect(`/voice/driver-time?date=${date.toISODate()}&dir=${direction}`);
    } catch (error) {
      console.error('Error setting date:', error);
      playPrompt(twiml, 'error_generic_try_later');
      twiml.redirect(`/voice/driver-date?dir=${direction}`);
    }
  } else if (Digits === '3') {
    // Custom date
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 6,
      timeout: 15,
      action: `/voice/driver-custom-date?dir=${direction}`
    });
    playPrompt(gather, 'enter_date_six_digits');
    playPrompt(twiml, 'invalid_date_try_again');
    twiml.redirect(`/voice/driver-date?dir=${direction}`);
  } else {
    // Invalid choice - retry with clear message
    playPrompt(twiml, 'invalid_date_option_retry');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 6,
      action: `/voice/driver-date-choice?dir=${direction}`
    });
    playPrompt(gather, 'date_choice_prompt');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle custom date entry
voiceRouter.post('/driver-custom-date', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  // Get direction from query params
  const direction = req.query.dir || req.session.direction || '';
  req.session.direction = direction;
  
  try {
    if (!/^\d{6}$/.test(Digits)) throw new Error('Invalid date format');
    
    const day = parseInt(Digits.substring(0, 2), 10);
    const month = parseInt(Digits.substring(2, 4), 10);
    const year = 2000 + parseInt(Digits.substring(4, 6), 10);
    
    // Validate date
    const date = DateTime.fromObject({ day, month, year }, { zone: TZ });
    if (!date.isValid) throw new Error('Invalid date');
    
    // Check that date is not in the past
    const now = DateTime.now().setZone(TZ).startOf('day');
    if (date < now) throw new Error('Date is in the past');
    
    req.session.rideDate = date.toISODate();
    twiml.redirect(`/voice/driver-time?date=${date.toISODate()}&dir=${direction}`);
  } catch (error) {
    console.error('Error processing custom date:', error);
    playPrompt(twiml, 'invalid_date_try_again');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 6,
      timeout: 15,
      action: `/voice/driver-custom-date?dir=${direction}`
    });
    playPrompt(gather, 'enter_date_six_digits');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Ask for departure time
voiceRouter.post('/driver-time', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 4,
    timeout: 15,
    action: `/voice/driver-departure-time?date=${date}&dir=${direction}`
  });
  playPrompt(gather, 'time_enter_departure');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle departure time and ask for seats
voiceRouter.post('/driver-departure-time', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  
  try {
    if (!/^\d{4}$/.test(Digits)) throw new Error('Invalid time format');
    
    const hours = parseInt(Digits.substring(0, 2), 10);
    const minutes = parseInt(Digits.substring(2, 4), 10);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error('Invalid time values');
    }
    
    // Store time in session
    req.session.departureTime = { hours, minutes };
    twiml.redirect(`/voice/driver-seats?date=${date}&dir=${direction}&time=${hours}:${minutes}`);
  } catch (error) {
    console.error('Error processing departure time:', error);
    playPrompt(twiml, 'invalid_time_format');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 4,
      timeout: 15,
      action: `/voice/driver-departure-time?date=${date}&dir=${direction}`
    });
    playPrompt(gather, 'time_enter_departure');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Ask for total seat availability
voiceRouter.post('/driver-seats', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const time = req.query.time || '';
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/driver-total-seats?date=${date}&dir=${direction}&time=${time}`
  });
  playPrompt(gather, 'passenger_details_intro');
  playPrompt(gather, 'driver_total_seats_question');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle total seats and ask for male-only breakdown
voiceRouter.post('/driver-total-seats', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const time = req.query.time || '';
  
  // Validate input exists and is a single digit
  if (!Digits || !/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/driver-total-seats?date=${date}&dir=${direction}&time=${time}`
    });
    playPrompt(gather, 'driver_total_seats_question');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  const totalSeats = parseInt(Digits, 10);
  
  // Must have at least 1 seat
  if (totalSeats === 0) {
    playPrompt(twiml, 'need_at_least_one_passenger');
    twiml.redirect(`/voice/driver-seats?date=${date}&dir=${direction}&time=${time}`);
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store total seats
  req.session.totalSeats = totalSeats;
  
  // Ask how many are male-only - pass total in query params
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/driver-male-seats?total=${totalSeats}&date=${date}&dir=${direction}&time=${time}`
  });
  playPrompt(gather, 'driver_male_only_from_total');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle male-only seats and ask for female-only seats (if needed)
voiceRouter.post('/driver-male-seats', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  // Get total from query params or session
  const totalSeats = parseInt(req.query.total) || req.session.totalSeats || 0;
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const time = req.query.time || '';
  
  // Validate input exists and is a single digit
  if (!Digits || !/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/driver-male-seats?total=${totalSeats}&date=${date}&dir=${direction}&time=${time}`
    });
    playPrompt(gather, 'driver_male_only_from_total');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  const maleOnlySeats = parseInt(Digits, 10);
  
  // Validate: male-only can't exceed total
  if (maleOnlySeats > totalSeats) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/driver-male-seats?total=${totalSeats}&date=${date}&dir=${direction}&time=${time}`
    });
    playPrompt(gather, 'driver_male_only_from_total');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store male-only seats
  req.session.maleOnlySeats = maleOnlySeats;
  
  // If all seats are male-only, skip female question and go directly to confirm
  if (maleOnlySeats === totalSeats) {
    req.session.femaleOnlySeats = 0;
    req.session.anygenderSeats = 0;
    req.session.totalSeats = totalSeats;
    twiml.redirect(`/voice/driver-confirm?total=${totalSeats}&male=${maleOnlySeats}&female=0&date=${date}&dir=${direction}&time=${time}`);
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Otherwise, ask for female-only seats
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/driver-female-seats?total=${totalSeats}&male=${maleOnlySeats}&date=${date}&dir=${direction}&time=${time}`
  });
  playPrompt(gather, 'driver_female_only_from_total');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Handle female-only seats and auto-calculate anygender seats
voiceRouter.post('/driver-female-seats', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  // Get values from query params or session
  const totalSeats = parseInt(req.query.total) || req.session.totalSeats || 0;
  const maleOnlySeats = parseInt(req.query.male) || req.session.maleOnlySeats || 0;
  const remainingSeats = totalSeats - maleOnlySeats;
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const time = req.query.time || '';
  
  // Validate input exists and is a single digit
  if (!Digits || !/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/driver-female-seats?total=${totalSeats}&male=${maleOnlySeats}&date=${date}&dir=${direction}&time=${time}`
    });
    playPrompt(gather, 'driver_female_only_from_total');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  const femaleOnlySeats = parseInt(Digits, 10);
  
  // Validate: female-only can't exceed remaining seats
  if (femaleOnlySeats > remainingSeats) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/driver-female-seats?total=${totalSeats}&male=${maleOnlySeats}&date=${date}&dir=${direction}&time=${time}`
    });
    playPrompt(gather, 'driver_female_only_from_total');
    playPrompt(twiml, 'no_input_goodbye');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store female-only seats
  req.session.femaleOnlySeats = femaleOnlySeats;
  
  // Auto-calculate anygender seats (remainder)
  const anygenderSeats = totalSeats - maleOnlySeats - femaleOnlySeats;
  req.session.anygenderSeats = anygenderSeats;
  req.session.totalSeats = totalSeats;
  req.session.maleOnlySeats = maleOnlySeats;
  
  // Go directly to confirmation
  twiml.redirect(`/voice/driver-confirm?total=${totalSeats}&male=${maleOnlySeats}&female=${femaleOnlySeats}&date=${date}&dir=${direction}&time=${time}`);
  
  res.type('text/xml').send(twiml.toString());
});

// Confirm ride offer details
voiceRouter.post('/driver-confirm', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  req.session = req.session || {};
  
  // Get values from query params or session
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const time = req.query.time || '';
  const totalSeats = parseInt(req.query.total) || req.session.totalSeats || 0;
  const maleSeats = parseInt(req.query.male) || req.session.maleOnlySeats || 0;
  const femaleSeats = parseInt(req.query.female) || req.session.femaleOnlySeats || 0;
  const anygenderSeats = totalSeats - maleSeats - femaleSeats;
  
  // Play confirmation intro
  playPrompt(twiml, 'confirm_request_intro');
  
  // Play ride details using recordings
  // Direction
  if (direction === 'FROM') {
    playPrompt(twiml, 'from_settlement');
  } else {
    playPrompt(twiml, 'to_settlement');
  }
  
  // Time - play the departure time
  if (time) {
    const timeStr = time.replace(':', '');
    playHHMM(twiml, timeStr);
  }
  
  // Seats - play seat breakdown
  playDigits(twiml, totalSeats.toString());
  playPrompt(twiml, 'seats');
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/driver-submit?date=${date}&dir=${direction}&time=${time}&total=${totalSeats}&male=${maleSeats}&female=${femaleSeats}`
  });
  playPrompt(gather, 'press_1_confirm_2_restart');
  playPrompt(twiml, 'no_input_goodbye');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Submit the ride offer to the database
voiceRouter.post('/driver-submit', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  req.session = req.session || {};
  
  // Get values from query params or session
  const date = req.query.date || req.session.rideDate || '';
  const direction = req.query.dir || req.session.direction || '';
  const time = req.query.time || '';
  const totalSeats = parseInt(req.query.total) || req.session.totalSeats || 0;
  const maleSeats = parseInt(req.query.male) || req.session.maleOnlySeats || 0;
  const femaleSeats = parseInt(req.query.female) || req.session.femaleOnlySeats || 0;
  const anygenderSeats = totalSeats - maleSeats - femaleSeats;
  
  if (Digits === '1') {
    try {
      const from = req.session.phone || normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
      
      logger.info('Driver submit - phone number', { from, fromLength: from?.length, sessionPhone: req.session.phone });
      
      // Validate required params
      if (!date || !direction || !time) {
        logger.error('Missing required parameters in driver-submit', {
          date,
          direction,
          time,
          queryParams: req.query
        });
        playPrompt(twiml, 'session_expired_restart');
        twiml.redirect('/voice/driver-new');
        res.type('text/xml').send(twiml.toString());
        return;
      }
      
      // Create date objects
      const rideDate = DateTime.fromISO(date).setZone(TZ);
      
      if (!rideDate.isValid) {
        logger.error('Invalid date in driver-submit', { date, rideDate });
        playPrompt(twiml, 'session_expired_restart');
        twiml.redirect('/voice/driver-new');
        res.type('text/xml').send(twiml.toString());
        return;
      }
      
      // Parse time from query param or session
      let hours, minutes;
      if (time && time.includes(':')) {
        [hours, minutes] = time.split(':').map(t => parseInt(t, 10));
      } else {
        hours = req.session.departureTime?.hours || 0;
        minutes = req.session.departureTime?.minutes || 0;
      }
      
      const departureDateTime = rideDate.set({
        hour: hours,
        minute: minutes,
        second: 0,
        millisecond: 0
      });
      
      // Get or create user to link to the offer
      const user = await getUserByPhone(from);
      
      // Create the ride offer
      const rideOffer = {
        driver_phone: from,
        direction: direction,
        departure_time: departureDateTime.toJSDate(),
        seats_male_only: maleSeats,
        seats_female_only: femaleSeats,
        seats_anygender: anygenderSeats
      };
      
      // Link to user if exists
      if (user && user.id) {
        rideOffer.user_id = user.id;
      }
      
      // Add the offer to the database
      const createdOffer = await addOffer(rideOffer);
      
      // Find matching requests
      const requests = await listOpenRequestsForOffer(createdOffer);
      const matches = await matchNewOffer(createdOffer, requests);
      
      // Provide immediate feedback
      if (matches.length > 0) {
        // Get the best match (first one returned by the matching algorithm)
        const bestMatch = matches[0];
        
        // Get the request details with full user information
        const matchedRequest = await getRequestWithUser(bestMatch.request_id);
        
        // Get rider information from the user object or fallback to phone lookup
        let riderInfo = "an unknown passenger";
        let riderPhone = matchedRequest.rider_phone;
        let riderName = null;
        
        // Prefer user object data if available
        if (matchedRequest.user) {
          riderName = matchedRequest.user.name;
          // Always use the user's registered phone number when available
          if (matchedRequest.user.phone) {
            riderPhone = matchedRequest.user.phone;
          }
        } else {
          // Fallback to separate query if user not populated
          const rider = await getUserByPhone(riderPhone);
          if (rider && rider.name) {
            riderName = rider.name;
          }
          if (rider && rider.phone) {
            riderPhone = rider.phone;
          }
        }
        
        if (riderName) {
          riderInfo = riderName;
        }
        
        // Format time and passenger details
        const preferredTime = matchedRequest.preferred_time 
          ? DateTime.fromJSDate(matchedRequest.preferred_time).setZone(TZ).toFormat('HH:mm')
          : "flexible time";
        
        const totalPassengers = matchedRequest.passengers_total || 
          ((matchedRequest.passengers_male || 0) + (matchedRequest.passengers_female || 0));
        
        // Tell the driver about the match
        playPrompt(twiml, 'great_news_found_ride');
        
        // Play rider's full name in Hebrew if available
        if (matchedRequest.user) {
          playFullName(twiml, matchedRequest.user, 'rider');
        }
        
        // Read out the phone number digit by digit
        logger.info('Playing rider phone number', { riderPhone, riderPhoneLength: riderPhone?.length });
        playPrompt(twiml, 'passenger_phone_number_is');
        playDigits(twiml, riderPhone);
        
        // Ask if they want to take this passenger
        const gather = twiml.gather({
          input: 'dtmf',
          numDigits: 1,
          timeout: 10,
          action: `/voice/driver-confirm-match?match_id=${bestMatch.id}&request_id=${matchedRequest.id}`
        });
        playPrompt(gather, 'press_1_accept_2_decline');
        playPrompt(twiml, 'offer_registered_keep_active');
        twiml.hangup();
      } else {
        playPrompt(twiml, 'request_registered');
        playPrompt(twiml, 'thanks_goodbye');
        twiml.hangup();
      }
    } catch (error) {
      console.error('Error creating ride offer:', error);
      playPrompt(twiml, 'error_generic_try_later');
      twiml.hangup();
    }
  } else {
    playPrompt(twiml, 'start_over');
    twiml.redirect('/voice/driver-new');
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle rider's decision about a match
voiceRouter.post('/rider-confirm-match', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  const matchId = req.query.match_id;
  const offerId = req.query.offer_id;
  
  try {
    if (Digits === '1') {
      // Rider accepted the match
      await updateMatchStatus(matchId, 'accepted');
      
      // Get offer details with user information
      const offer = await getOfferWithUser(offerId);
      const departureTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
      const timeStr = departureTime.toFormat('HH:mm');
      
      // Get the driver's phone number from user object if available
      let driverPhone = offer.driver_phone;
      if (offer.user && offer.user.phone) {
        driverPhone = offer.user.phone;
      } else if (!offer.user) {
        // Fallback to user lookup if not populated
        const driver = await getUserByPhone(offer.driver_phone);
        if (driver && driver.phone) {
          driverPhone = driver.phone;
        }
      }
      
      playPrompt(twiml, 'rider_accepted');
      
      // Play driver's full name in Hebrew if available
      if (offer.user) {
        playFullName(twiml, offer.user, 'driver');
      }
      
      playPrompt(twiml, 'driver_phone_number_is');
      playDigits(twiml, driverPhone);
      
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else if (Digits === '2') {
      // Rider declined the match
      await updateMatchStatus(matchId, 'declined');
  playPrompt(twiml, 'rider_declined');
  playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else if (Digits === '3') {
      // Rider wants to hear the driver's phone number
      const offer = await getOfferWithUser(offerId);
      if (offer) {
        // Get the driver's phone number from user object if available
        let driverPhone = offer.driver_phone;
        if (offer.user && offer.user.phone) {
          driverPhone = offer.user.phone;
        } else if (!offer.user) {
          // Fallback to user lookup if not populated
          const driver = await getUserByPhone(offer.driver_phone);
          if (driver && driver.phone) {
            driverPhone = driver.phone;
          }
        }
        twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(driverPhone)}&type=driver`);
      } else {
  playPrompt(twiml, 'info_not_available');
        twiml.hangup();
      }
    } else {
      // Invalid input
  playPrompt(twiml, 'invalid_input');
      twiml.hangup();
    }
  } catch (error) {
  console.error('Error handling match confirmation:', error);
  playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle driver's decision about a match
voiceRouter.post('/driver-confirm-match', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { Digits } = req.body;
  const matchId = req.query.match_id;
  const requestId = req.query.request_id;
  
  try {
    if (Digits === '1') {
      // Driver accepted the match
      await updateMatchStatus(matchId, 'accepted');
      
      // Get request details with user information
      const request = await getRequestWithUser(requestId);
      
      // Format time information
      let timeInfo = "";
      if (request.preferred_time) {
        const preferredTime = DateTime.fromJSDate(request.preferred_time).setZone(TZ);
        timeInfo = ` at their preferred time of ${preferredTime.toFormat('HH:mm')}`;
      } else {
        const earliestTime = DateTime.fromJSDate(request.earliest_time).setZone(TZ);
        const latestTime = DateTime.fromJSDate(request.latest_time).setZone(TZ);
        timeInfo = ` between ${earliestTime.toFormat('HH:mm')} and ${latestTime.toFormat('HH:mm')}`;
      }
      
      // Get the rider's phone number from user object if available
      let riderPhone = request.rider_phone;
      if (request.user && request.user.phone) {
        riderPhone = request.user.phone;
      } else if (!request.user) {
        // Fallback to user lookup if not populated
        const rider = await getUserByPhone(request.rider_phone);
        if (rider && rider.phone) {
          riderPhone = rider.phone;
        }
      }
      
      playPrompt(twiml, 'driver_accepted');
      
      // Play rider's full name in Hebrew if available
      if (request.user) {
        playFullName(twiml, request.user, 'rider');
      }
      
      playPrompt(twiml, 'passenger_phone_number_is');
      playDigits(twiml, riderPhone);
      
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else if (Digits === '2') {
      // Driver declined the match
      await updateMatchStatus(matchId, 'declined');
  playPrompt(twiml, 'driver_declined');
  playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else if (Digits === '3') {
      // Driver wants to hear the passenger's phone number
      const request = await getRequestWithUser(requestId);
      if (request) {
        // Get the rider's phone number from user object if available
        let riderPhone = request.rider_phone;
        if (request.user && request.user.phone) {
          riderPhone = request.user.phone;
        } else if (!request.user) {
          // Fallback to user lookup if not populated
          const rider = await getUserByPhone(request.rider_phone);
          if (rider && rider.phone) {
            riderPhone = rider.phone;
          }
        }
        twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(riderPhone)}&type=passenger`);
      } else {
  playPrompt(twiml, 'info_not_available');
        twiml.hangup();
      }
    } else {
      // Invalid input
  playPrompt(twiml, 'invalid_input');
      twiml.hangup();
    }
  } catch (error) {
  console.error('Error handling match confirmation:', error);
  playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle ringback (callback) for riders and drivers
voiceRouter.post('/ringback-start', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const riderPhone = req.query.r; // If this exists, it's a rider callback
  const driverPhone = req.query.d; // If this exists, it's a driver callback
  const isRider = !!riderPhone;
  const phone = riderPhone || driverPhone;
  
  logger.info('Ringback call started', {
    callSid: req.body.CallSid,
    callStatus: req.body.CallStatus,
    direction: isRider ? 'rider' : 'driver',
    phone,
    answeredBy: req.body.AnsweredBy || 'unknown'
  });
  
  // Check if it's answering machine or voicemail
  const answeredBy = req.body.AnsweredBy || 'unknown';
  if (answeredBy.toLowerCase() === 'machine_start' || answeredBy.toLowerCase() === 'machine_end_beep' || answeredBy.toLowerCase() === 'machine_end_silence') {
    logger.debug('Call answered by machine, leaving voicemail', {
      callSid: req.body.CallSid,
      answeredBy,
      phone
    });
    // This is a voicemail - leave a brief message
    // Leave a minimal voicemail
    playPrompt(twiml, 'great_news_found_ride');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Person answered, provide more detailed message
  try {
    const phone = isRider ? riderPhone : driverPhone;
    
    if (isRider) {
      // Get pending matches for this rider
      const pendingMatches = await listPendingMatchesForPhone(phone);
      
      if (pendingMatches && pendingMatches.length > 0) {
        // Get the latest match
        const match = pendingMatches[0];
        const offer = await getOfferWithUser(match.offer_id);
        
        if (offer) {
          // Get driver information from the user object or fallback to phone lookup
          let driverInfo = "an unknown driver";
          let driverPhone = offer.driver_phone;
          let driverName = null;
          
          // Prefer user object data if available
          if (offer.user) {
            driverName = offer.user.name;
            driverPhone = offer.user.phone || offer.driver_phone;
          } else {
            // Fallback to separate query if user not populated
            const driver = await getUserByPhone(driverPhone);
            if (driver && driver.name) {
              driverName = driver.name;
            }
          }
          
          if (driverName) {
            driverInfo = driverName;
          }
          
          // Format the departure time
          const departureTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
          const timeStr = departureTime.toFormat('HH:mm');
          
          // Tell the rider about the match
          playPrompt(twiml, 'great_news_found_ride');
          
          // Play driver's full name in Hebrew if available
          if (offer.user) {
            playFullName(twiml, offer.user, 'driver');
          }
          
          // Offer options
          const gather = twiml.gather({
            input: 'dtmf',
            numDigits: 1,
            timeout: 10,
            action: `/voice/rider-confirm-match?match_id=${match.id}&offer_id=${offer.id}`
          });
          
          playPrompt(gather, 'press_1_accept_2_decline_3_hear_phone');
          playPrompt(twiml, 'thanks_goodbye');
        } else {
          playPrompt(twiml, 'info_not_available');
        }
      } else {
        playPrompt(twiml, 'info_not_available');
      }
    } else {
      // Driver callback flow
      const pendingMatches = await listPendingMatchesForDriverPhone(phone);
      
      if (pendingMatches && pendingMatches.length > 0) {
        // Get the latest match
        const match = pendingMatches[0];
        const request = await getRequestWithUser(match.request_id);
        
        if (request) {
          // Get rider information from the user object or fallback to phone lookup
          let riderInfo = "an unknown passenger";
          let riderPhone = request.rider_phone;
          let riderName = null;
          
          // Prefer user object data if available
          if (request.user) {
            riderName = request.user.name;
            // Always use the user's registered phone number when available
            if (request.user.phone) {
              riderPhone = request.user.phone;
            }
          } else {
            // Fallback to separate query if user not populated
            const rider = await getUserByPhone(riderPhone);
            if (rider && rider.name) {
              riderName = rider.name;
            }
            if (rider && rider.phone) {
              riderPhone = rider.phone;
            }
          }
          
          if (riderName) {
            riderInfo = riderName;
          }
          
          // Format time and passenger details
          const preferredTime = request.preferred_time 
            ? DateTime.fromJSDate(request.preferred_time).setZone(TZ).toFormat('HH:mm')
            : "flexible time";
          
          const totalPassengers = request.passengers_total || 
            ((request.passengers_male || 0) + (request.passengers_female || 0));
          
          // Tell the driver about the match
          playPrompt(twiml, 'great_news_found_ride');
          
          // Play rider's full name in Hebrew if available
          if (request.user) {
            playFullName(twiml, request.user, 'rider');
          }
          
          // Offer options
          const gather = twiml.gather({
            input: 'dtmf',
            numDigits: 1,
            timeout: 10,
            action: `/voice/driver-confirm-match?match_id=${match.id}&request_id=${request.id}`
          });
          
          playPrompt(gather, 'press_1_accept_2_decline_3_hear_phone');
          playPrompt(twiml, 'thanks_goodbye');
        } else {
          playPrompt(twiml, 'info_not_available');
        }
      } else {
        playPrompt(twiml, 'info_not_available');
      }
    }
  } catch (error) {
    console.error('Error in ringback handler:', error);
    playPrompt(twiml, 'error_generic_try_later');
  }
  
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Handler for hearing phone number from ringback
voiceRouter.post('/ringback-hear-phone', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const { phone, type } = req.query;
  
  try {
    logger.info('Ringback hear phone', { phone, phoneLength: phone?.length, type });
    playPrompt(twiml, type === 'driver' ? 'driver_phone_number_is' : 'passenger_phone_number_is');
    playDigits(twiml, phone);
    twiml.pause({ length: 1 });
    playPrompt(twiml, 'will_repeat');
    playDigits(twiml, phone);
    playPrompt(twiml, 'thanks_goodbye');
  } catch (error) {
    console.error('Error in phone number handler:', error);
    playPrompt(twiml, 'error_generic_try_later');
  }
  
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Management redirect
voiceRouter.post('/manage', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.redirect('/voice/manage/menu');
  res.type('text/xml').send(twiml.toString());
});

// ==================== REGISTRATION FLOW ====================

// Registration welcome - inform user they need to register
voiceRouter.post('/register/welcome', (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const twiml = new twilio.twiml.VoiceResponse();
  
  logger.info('Registration welcome', {
    phone: req.session?.phone
  });
  
  // Welcome message for new user
  playPrompt(twiml, 'registration_welcome');
  
  // Redirect to name recording
  twiml.redirect(`/voice/register/record-name?lang=${language}`);
  res.type('text/xml').send(twiml.toString());
});

// Record user's name
voiceRouter.post('/register/record-name', (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const twiml = new twilio.twiml.VoiceResponse();
  
  logger.info('Recording name prompt', {
    phone: req.session?.phone
  });
  
  // Prompt user to record their name
  playPrompt(twiml, 'registration_record_name');
  
  // Record the name (max 5 seconds, finish on #)
  twiml.record({
    maxLength: 5,
    finishOnKey: '#',
    action: `/voice/register/save-name?lang=${language}`,
    recordingStatusCallback: `/voice/register/recording-status`,
    timeout: 3,
    transcribe: false
  });
  
  res.type('text/xml').send(twiml.toString());
});

// Save the recorded name
voiceRouter.post('/register/save-name', async (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const phone = req.session?.phone || normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  const recordingUrl = req.body.RecordingUrl;
  
  logger.info('Saving recorded name', {
    phone,
    recordingUrl,
    hasRecording: !!recordingUrl,
    fromSession: !!req.session?.phone,
    fromBody: !!req.body.From
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  try {
    if (!phone) {
      logger.error('No phone in session or request body for name recording');
      playPrompt(twiml, 'error_generic_try_later');
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Save recording URL to database
    if (recordingUrl) {
      await saveNameRecording(phone, recordingUrl);
      logger.info('Name recording saved', { phone, recordingUrl });
      
      // Confirm and proceed to PIN selection
      playPrompt(twiml, 'registration_name_recorded');
      twiml.redirect(`/voice/register/choose-pin?lang=${language}`);
    } else {
      // No recording captured, try again
      logger.warn('No recording URL received');
      playPrompt(twiml, 'error_generic_try_later');
      twiml.redirect(`/voice/register/record-name?lang=${language}`);
    }
  } catch (err) {
    logger.error('Error saving name recording', {
      error: err.message,
      stack: err.stack,
      phone
    });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Recording status callback (for logging)
voiceRouter.post('/register/recording-status', (req, res) => {
  logger.info('Recording status callback', {
    recordingSid: req.body.RecordingSid,
    recordingUrl: req.body.RecordingUrl,
    recordingStatus: req.body.RecordingStatus,
    recordingDuration: req.body.RecordingDuration
  });
  res.sendStatus(200);
});

// Choose PIN - prompt user to enter 4-digit PIN
voiceRouter.post('/register/choose-pin', (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const twiml = new twilio.twiml.VoiceResponse();
  
  logger.info('PIN selection prompt', {
    phone: req.session?.phone
  });
  
  playPrompt(twiml, 'registration_choose_pin');
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 4,
    timeout: 10,
    action: `/voice/register/confirm-pin?lang=${language}`
  });
  
  playPrompt(twiml, 'error_generic_try_later');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Confirm PIN - ask user to enter PIN again
voiceRouter.post('/register/confirm-pin', (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const { Digits } = req.body;
  const twiml = new twilio.twiml.VoiceResponse();
  
  logger.info('PIN confirmation prompt', {
    phone: req.session?.phone,
    pinLength: Digits?.length
  });
  
  // Validate PIN format
  if (!isValidPINFormat(Digits)) {
    logger.warn('Invalid PIN format', { pin: Digits });
    playPrompt(twiml, 'registration_pin_invalid');
    twiml.redirect(`/voice/register/choose-pin?lang=${language}`);
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store PIN temporarily in session AND pass it as query param for reliability
  req.session.tempPIN = Digits;
  
  // Ask for confirmation
  playPrompt(twiml, 'registration_confirm_pin');
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 4,
    timeout: 10,
    action: `/voice/register/save-pin?lang=${language}&temp=${Digits}`
  });
  
  playPrompt(twiml, 'error_generic_try_later');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Save PIN - verify match and save to database
voiceRouter.post('/register/save-pin', async (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const { Digits } = req.body;
  const phone = req.session?.phone || normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  const tempPIN = req.query.temp || req.session?.tempPIN;  // Try query param first, then session
  
  logger.info('Saving PIN', {
    phone,
    pinMatch: Digits === tempPIN,
    hasTemp: !!tempPIN,
    fromSession: !!req.session?.phone,
    fromBody: !!req.body.From,
    fromQuery: !!req.query.temp
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  try {
    if (!phone || !tempPIN) {
      logger.error('Missing phone or temp PIN in session');
      playPrompt(twiml, 'error_generic_try_later');
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Check if PINs match
    if (Digits !== tempPIN) {
      logger.warn('PIN mismatch', { phone });
      playPrompt(twiml, 'registration_pin_mismatch');
      delete req.session.tempPIN;
      twiml.redirect(`/voice/register/choose-pin?lang=${language}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Hash and save PIN
    const hashedPIN = await hashPIN(Digits);
    await savePIN(phone, hashedPIN);
    
    logger.info('Registration completed successfully', { phone });
    
    // Clean up session
    delete req.session.tempPIN;
    
    // Confirm completion and redirect to main menu
    playPrompt(twiml, 'registration_complete');
    twiml.redirect(`/voice/incoming?lang=${language}`);
    
  } catch (err) {
    logger.error('Error saving PIN', {
      error: err.message,
      stack: err.stack,
      phone
    });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Reset PIN flow - for existing users (option 4 from main menu)
voiceRouter.post('/register/reset-pin', (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const twiml = new twilio.twiml.VoiceResponse();
  
  logger.info('PIN reset initiated', {
    phone: req.session?.phone
  });
  
  playPrompt(twiml, 'reset_pin_intro');
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 4,
    timeout: 10,
    action: `/voice/register/reset-pin-confirm?lang=${language}`
  });
  
  playPrompt(twiml, 'error_generic_try_later');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Confirm new PIN during reset
voiceRouter.post('/register/reset-pin-confirm', (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const { Digits } = req.body;
  const twiml = new twilio.twiml.VoiceResponse();
  
  logger.info('PIN reset confirmation', {
    phone: req.session?.phone,
    pinLength: Digits?.length
  });
  
  // Validate PIN format
  if (!isValidPINFormat(Digits)) {
    logger.warn('Invalid PIN format during reset', { pin: Digits });
    playPrompt(twiml, 'registration_pin_invalid');
    twiml.redirect(`/voice/register/reset-pin?lang=${language}`);
    res.type('text/xml').send(twiml.toString());
    return;
  }
  
  // Store PIN temporarily in session AND pass it as query param for reliability
  req.session.tempPIN = Digits;
  
  // Ask for confirmation
  playPrompt(twiml, 'registration_confirm_pin');
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 4,
    timeout: 10,
    action: `/voice/register/reset-pin-save?lang=${language}&temp=${Digits}`
  });
  
  playPrompt(twiml, 'error_generic_try_later');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Save new PIN during reset
voiceRouter.post('/register/reset-pin-save', async (req, res) => {
  const language = req.query.lang || (req.session && req.session.language) || DEFAULT_LANGUAGE;
  const { Digits } = req.body;
  const phone = req.session?.phone || normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  const tempPIN = req.query.temp || req.session?.tempPIN;  // Try query param first, then session
  
  logger.info('Saving reset PIN', {
    phone,
    pinMatch: Digits === tempPIN,
    fromSession: !!req.session?.phone,
    fromBody: !!req.body.From,
    fromQuery: !!req.query.temp
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  try {
    if (!phone || !tempPIN) {
      logger.error('Missing phone or temp PIN in reset session');
      playPrompt(twiml, 'error_generic_try_later');
      twiml.hangup();
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Check if PINs match
    if (Digits !== tempPIN) {
      logger.warn('PIN mismatch during reset', { phone });
      playPrompt(twiml, 'registration_pin_mismatch');
      delete req.session.tempPIN;
      twiml.redirect(`/voice/register/reset-pin?lang=${language}`);
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Hash and update PIN
    const hashedPIN = await hashPIN(Digits);
    await updatePIN(phone, hashedPIN);
    
    logger.info('PIN reset completed successfully', { phone });
    
    // Clean up session
    delete req.session.tempPIN;
    
    // Confirm success and return to main menu
    playPrompt(twiml, 'reset_pin_success');
    twiml.redirect(`/voice/incoming?lang=${language}`);
    
  } catch (err) {
    logger.error('Error resetting PIN', {
      error: err.message,
      stack: err.stack,
      phone
    });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

export default voiceRouter;
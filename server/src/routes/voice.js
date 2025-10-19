import { Router } from 'express';
import twilio from 'twilio';
import { 
  addRequest, 
  addOffer, 
  listActiveOffersForRequest, 
  listOpenRequestsForOffer, 
  getOfferById, 
  getRequestById,
  getUserByPhone, 
  updateMatchStatus,
  listPendingMatchesForPhone,
  listPendingMatchesForDriverPhone
} from '../db/repo.js';
import { matchNewOffer, matchNewRequest } from '../engine/matching.js';
import { DateTime } from 'luxon';
import { TZ } from '../utils/time.js';
import { playPrompt } from '../utils/recordings.js';
import logger from '../utils/logger.js';
import { DEFAULT_LANGUAGE } from '../config/language.js';

export const voiceRouter = Router();

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
  const phone = req.body.From;
  // Set session language based on query param if provided, default to English
  const language = req.query.lang || DEFAULT_LANGUAGE;
  
  // Store language preference in session for future requests
  if (!req.session) {
    req.session = {};
  }
  req.session.language = language;
  
  logger.info('Incoming call received', {
    from: phone,
    callSid: req.body.CallSid,
    callStatus: req.body.CallStatus,
    language
  });
  
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Use recorded audio for Hebrew
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
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\\d]/g, '');
  
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
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 4,
    timeout: 15,
    action: '/voice/rider-earliest-time'
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
    const earliestTimeStr = `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
    
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 4,
      timeout: 15,
      action: `/voice/rider-latest-time?earliest=${earliestTimeStr}&date=${req.session.rideDate}&dir=${req.session.direction}`
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
      action: '/voice/rider-earliest-time'
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
    if (!earliestTimeStr || earliestTimeStr.length !== 4) {
      logger.error('Earliest time not found in query params');
      playPrompt(twiml, 'session_expired_restart');
      twiml.redirect('/voice/rider-new');
      res.type('text/xml').send(twiml.toString());
      return;
    }
    
    // Parse earliest time from query string
    const earliestHours = parseInt(earliestTimeStr.substring(0, 2), 10);
    const earliestMinutes = parseInt(earliestTimeStr.substring(2, 4), 10);
    
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
    const earliestHours = req.session.earliestTime.hours;
    const earliestMinutes = req.session.earliestTime.minutes;
    const latestHours = req.session.latestTime.hours;
    const latestMinutes = req.session.latestTime.minutes;
    
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
  
  // Calculate total passengers
  const totalCount = maleCount + femaleCount;
  
  if (totalCount === 0) {
    playPrompt(twiml, 'need_at_least_one_passenger');
    twiml.redirect(`/voice/rider-passengers?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}`);
  } else if (totalCount >= 2) {
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-couples-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}`
    });
    playPrompt(gather, 'couples_how_many');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=0`);
  } else {
    // Only one passenger, no couples
    req.session.couplesCount = 0;
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=0`);
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
  
  // Validate input is a single digit
  if (!/^\d$/.test(Digits)) {
    playPrompt(twiml, 'invalid_passenger_count');
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-couples-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}`
    });
    playPrompt(gather, 'couples_how_many');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=0`);
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
      action: `/voice/rider-couples-count?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}`
    });
    playPrompt(gather, 'couples_how_many');
    playPrompt(twiml, 'continue_without_preferred');
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=0`);
  } else {
    req.session.couplesCount = couplesCount;
    twiml.redirect(`/voice/rider-together?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=${couplesCount}`);
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
  const couplesCount = parseInt(req.query.couples) || req.session.couplesCount || 0;
  const totalCount = maleCount + femaleCount;
  
  if (totalCount > 1) {
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/rider-confirm?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=${couplesCount}`
    });
  playPrompt(gather, 'together_question');
  playPrompt(twiml, 'assuming_together');
    
    // Default to together if no input
    req.session.together = true;
    twiml.redirect(`/voice/rider-confirm?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=${couplesCount}&together=1`);
  } else {
    // Only one passenger, must travel together
    req.session.together = true;
    twiml.redirect(`/voice/rider-confirm?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=${couplesCount}&together=1`);
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
  
  const directionStr = direction === 'FROM' ? 'from the settlement' : 'to the settlement';
  const totalCount = maleCount + femaleCount;
  const passengersStr = `${totalCount} passenger${totalCount > 1 ? 's' : ''}: ${maleCount} male, ${femaleCount} female, including ${couplesCount} couple${couplesCount !== 1 ? 's' : ''}`;
  const togetherStr = req.session.together ? 'Passengers must travel together' : 'Passengers can travel separately';
  
  playPrompt(twiml, 'confirm_request_intro');
  
  const gather = twiml.gather({
    input: 'dtmf',
    numDigits: 1,
    timeout: 10,
    action: `/voice/rider-submit?date=${date}&dir=${direction}&earliest=${earliest}&latest=${latest}&preferred=${preferred}&male=${maleCount}&female=${femaleCount}&couples=${couplesCount}&together=${together}`
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
  const couplesCount = parseInt(req.query.couples) || req.session.couplesCount || 0;
  const together = req.query.together === '1';
  
  if (Digits === '1') {
    try {
      const from = req.session.phone || (req.body.Caller || req.body.From || '').replace(/[^+\\d]/g, '');
      
      // Create date objects
      const rideDate = DateTime.fromISO(date).setZone(TZ);
      
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
      
      // Create the ride request
      const rideRequest = {
        rider_phone: from,
        direction: direction,
        earliest_time: earliestDateTime.toJSDate(),
        latest_time: latestDateTime.toJSDate(),
        passengers_male: maleCount,
        passengers_female: femaleCount,
        passengers_total: maleCount + femaleCount,
        couples_count: couplesCount,
        together: together || req.session.together
      };
      
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
        
        // Get the offer details for the best match
        const matchedOffer = await getOfferById(bestMatch.offer_id);
        
        // Get driver information if available
        let driverInfo = "an unknown driver";
        const driverPhone = matchedOffer.driver_phone;
        const driver = await getUserByPhone(driverPhone);
        if (driver && driver.name) {
          driverInfo = driver.name;
        }
        
        // Format the departure time
        const departureTime = DateTime.fromJSDate(matchedOffer.departure_time).setZone(TZ);
        const timeStr = departureTime.toFormat('HH:mm');
        
        // Tell the rider about the match
        playPrompt(twiml, 'great_news_found_ride');
        // Read out the phone number digit by digit
        playPrompt(twiml, 'driver_phone_number_is');
        // Play driver phone digits
        {
          // use recordings digit-by-digit
          const s = String(driverPhone || '');
          for (const ch of s) {
            if (ch === '+') playPrompt(twiml, 'plus');
            else if (/\d/.test(ch)) playPrompt(twiml, `digit_${ch}`);
          }
        }
        
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
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\\d]/g, '');
  
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
    req.session.unisexSeats = 0;
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

// Handle female-only seats and auto-calculate unisex seats
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
  
  // Auto-calculate unisex seats (remainder)
  const unisexSeats = totalSeats - maleOnlySeats - femaleOnlySeats;
  req.session.unisexSeats = unisexSeats;
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
  
  // Generate summary for confirmation
  const dateObj = DateTime.fromISO(date || req.session.rideDate).setZone(TZ);
  const dateStr = dateObj.toFormat('MMMM d, yyyy');
  
  const departureTime = time || `${req.session.departureTime.hours.toString().padStart(2, '0')}:${req.session.departureTime.minutes.toString().padStart(2, '0')}`;
  
  const directionStr = direction === 'FROM' ? 'from the settlement' : 'to the settlement';
  const unisexSeats = totalSeats - maleSeats - femaleSeats;
  const seatsStr = `${totalSeats} total seat${totalSeats > 1 ? 's' : ''}: ${maleSeats} for males only, ${femaleSeats} for females only, and ${unisexSeats} unisex seats`;
  
  playPrompt(twiml, 'confirm_request_intro');
  
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
  const unisexSeats = totalSeats - maleSeats - femaleSeats;
  
  if (Digits === '1') {
    try {
      const from = req.session.phone || (req.body.Caller || req.body.From || '').replace(/[^+\\d]/g, '');
      
      // Create date objects
      const rideDate = DateTime.fromISO(date).setZone(TZ);
      
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
      
      // Create the ride offer
      const rideOffer = {
        driver_phone: from,
        direction: direction,
        departure_time: departureDateTime.toJSDate(),
        seats_male_only: maleSeats,
        seats_female_only: femaleSeats,
        seats_unisex: unisexSeats
      };
      
      // Add the offer to the database
      const createdOffer = await addOffer(rideOffer);
      
      // Find matching requests
      const requests = await listOpenRequestsForOffer(createdOffer);
      const matches = await matchNewOffer(createdOffer, requests);
      
      // Provide immediate feedback
      if (matches.length > 0) {
        // Get the best match (first one returned by the matching algorithm)
        const bestMatch = matches[0];
        
        // Get the request details for the best match
        const matchedRequest = await getRequestById(bestMatch.request_id);
        
        // Get rider information if available
        let riderInfo = "an unknown passenger";
        const riderPhone = matchedRequest.rider_phone;
        const rider = await getUserByPhone(riderPhone);
        if (rider && rider.name) {
          riderInfo = rider.name;
        }
        
        // Format time and passenger details
        const preferredTime = matchedRequest.preferred_time 
          ? DateTime.fromJSDate(matchedRequest.preferred_time).setZone(TZ).toFormat('HH:mm')
          : "flexible time";
        
        const totalPassengers = matchedRequest.passengers_total || 
          ((matchedRequest.passengers_male || 0) + (matchedRequest.passengers_female || 0));
        
        // Tell the driver about the match
        playPrompt(twiml, 'great_news_found_ride');
        // Read out the phone number digit by digit
        playPrompt(twiml, 'passenger_phone_number_is');
        {
          const s = String(riderPhone || '');
          for (const ch of s) {
            if (ch === '+') playPrompt(twiml, 'plus');
            else if (/\d/.test(ch)) playPrompt(twiml, `digit_${ch}`);
          }
        }
        
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
      
      // Get offer details again to confirm
      const offer = await getOfferById(offerId);
      const departureTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
      const timeStr = departureTime.toFormat('HH:mm');
      
      playPrompt(twiml, 'rider_accepted');
      playPrompt(twiml, 'driver_phone_number_is');
      {
        const s = String(offer.driver_phone || '');
        for (const ch of s) {
          if (ch === '+') playPrompt(twiml, 'plus');
          else if (/\d/.test(ch)) playPrompt(twiml, `digit_${ch}`);
        }
      }
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
      const offer = await getOfferById(offerId);
      if (offer) {
        twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(offer.driver_phone)}&type=driver`);
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
      
      // Get request details again to confirm
      const request = await getRequestById(requestId);
      
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
      
      playPrompt(twiml, 'driver_accepted');
      playPrompt(twiml, 'passenger_phone_number_is');
      {
        const s = String(request.rider_phone || '');
        for (const ch of s) {
          if (ch === '+') playPrompt(twiml, 'plus');
          else if (/\d/.test(ch)) playPrompt(twiml, `digit_${ch}`);
        }
      }
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
      const request = await getRequestById(requestId);
      if (request) {
        twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(request.rider_phone)}&type=passenger`);
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
        const offer = await getOfferById(match.offer_id);
        
        if (offer) {
          // Get driver information if available
          let driverInfo = "an unknown driver";
          const driverPhone = offer.driver_phone;
          const driver = await getUserByPhone(driverPhone);
          if (driver && driver.name) {
            driverInfo = driver.name;
          }
          
          // Format the departure time
          const departureTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
          const timeStr = departureTime.toFormat('HH:mm');
          
          // Tell the rider about the match
          playPrompt(twiml, 'great_news_found_ride');
          
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
        const request = await getRequestById(match.request_id);
        
        if (request) {
          // Get rider information if available
          let riderInfo = "an unknown passenger";
          const riderPhone = request.rider_phone;
          const rider = await getUserByPhone(riderPhone);
          if (rider && rider.name) {
            riderInfo = rider.name;
          }
          
          // Format time and passenger details
          const preferredTime = request.preferred_time 
            ? DateTime.fromJSDate(request.preferred_time).setZone(TZ).toFormat('HH:mm')
            : "flexible time";
          
          const totalPassengers = request.passengers_total || 
            ((request.passengers_male || 0) + (request.passengers_female || 0));
          
          // Tell the driver about the match
          playPrompt(twiml, 'great_news_found_ride');
          
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
    playPrompt(twiml, type === 'driver' ? 'driver_phone_number_is' : 'passenger_phone_number_is');
    {
      const s = String(phone || '');
      for (const ch of s) {
        if (ch === '+') playPrompt(twiml, 'plus');
        else if (/\d/.test(ch)) playPrompt(twiml, `digit_${ch}`);
      }
    }
    twiml.pause({ length: 1 });
    playPrompt(twiml, 'will_repeat');
    {
      const s = String(phone || '');
      for (const ch of s) {
        if (ch === '+') playPrompt(twiml, 'plus');
        else if (/\d/.test(ch)) playPrompt(twiml, `digit_${ch}`);
      }
    }
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
  twiml.redirect('/manage/menu');
  res.type('text/xml').send(twiml.toString());
});

export default voiceRouter;
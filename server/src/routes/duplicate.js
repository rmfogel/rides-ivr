import { Router } from 'express';
import twilio from 'twilio';
import { playPrompt } from '../utils/recordings.js';
import { getSession, patchSession } from '../store/session.js';
import { parseDateChoice, combineDateAndHHMM } from '../utils/time.js';
import { DateTime } from 'luxon';
import { addOffer, addRequest, getLastRideByPhone } from '../db/repo.js';

export const duplicateRouter = Router();

duplicateRouter.post('/date', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\d]/g, '');
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_duplicate_date' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (d === '1') {
      // Begin date selection for the duplicated ride
      patchSession(callSid, { step: 'manage_duplicate_date_choice', data: session.data });
  const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 6, action: '/voice/manage/duplicate/date-choice' });
  playPrompt(g, 'date_choice_prompt');
      return res.type('text/xml').send(twiml.toString());
    } else {
      // Return to main menu
      patchSession(callSid, { step: 'manage_main_menu', data: session.data });
      twiml.redirect('/voice/manage');
      return res.type('text/xml').send(twiml.toString());
    }
  } catch (error) {
  console.error('Error in duplicate-date flow:', error);
  playPrompt(twiml, 'error_generic_try_later');
    patchSession(callSid, { step: 'manage_main_menu', data: session.data });
    twiml.redirect('/voice/manage');
  }
  
  res.type('text/xml').send(twiml.toString());
});

duplicateRouter.post('/date-choice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\d]/g, '');
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_duplicate_date_choice' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (['1', '2', '3'].includes(d)) {
      session.data.dateChoice = d;
      
      if (d === '3') {
        // Need specific date
        patchSession(callSid, { step: 'manage_duplicate_date_input', data: session.data });
  const g = twiml.gather({ input: 'dtmf', numDigits: 6, timeout: 8, action: '/voice/manage/duplicate/date-input' });
  playPrompt(g, 'enter_date_six_digits');
        return res.type('text/xml').send(twiml.toString());
      } else {
        // Today or tomorrow
        session.data.dateDay = parseDateChoice(d).toISO();
        
        // Now ask for time
        patchSession(callSid, { step: 'manage_duplicate_time', data: session.data });
        const g = twiml.gather({ input: 'dtmf', numDigits: 4, timeout: 8, action: '/voice/manage/duplicate/time' });
        if (session.data.duplicateType === 'driver') {
          playPrompt(g, 'time_enter_departure');
        } else {
          playPrompt(g, 'time_enter_earliest');
        }
        return res.type('text/xml').send(twiml.toString());
      }
    } else {
  const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 6, action: '/voice/manage/duplicate/date-choice' });
  playPrompt(g, 'invalid_input');
  playPrompt(g, 'date_choice_prompt');
      return res.type('text/xml').send(twiml.toString());
    }
  } catch (error) {
  console.error('Error in duplicate-date-choice flow:', error);
  playPrompt(twiml, 'error_generic_try_later');
    patchSession(callSid, { step: 'manage_main_menu', data: session.data });
    twiml.redirect('/voice/manage');
  }
  
  res.type('text/xml').send(twiml.toString());
});

duplicateRouter.post('/date-input', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\d]/g, '');
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_duplicate_date_input' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    const day = parseDateChoice('3', d);
    session.data.dateDay = day.toISO();
    patchSession(callSid, { step: 'manage_duplicate_time', data: session.data });
    const g = twiml.gather({ input: 'dtmf', numDigits: 4, timeout: 8, action: '/voice/manage/duplicate/time' });
    if (session.data.duplicateType === 'driver') {
      playPrompt(g, 'time_enter_departure');
    } else {
      playPrompt(g, 'time_enter_earliest');
    }
    return res.type('text/xml').send(twiml.toString());
  } catch (e) {
  const g = twiml.gather({ input: 'dtmf', numDigits: 6, timeout: 8, action: '/voice/manage/duplicate/date-input' });
  playPrompt(g, 'invalid_date_try_again');
  playPrompt(g, 'enter_date_six_digits');
    return res.type('text/xml').send(twiml.toString());
  }
});

duplicateRouter.post('/time', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\d]/g, '');
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_duplicate_time' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (!/^\d{4}$/.test(d)) {
  const g = twiml.gather({ input: 'dtmf', numDigits: 4, timeout: 8, action: '/voice/manage/duplicate/time' });
  playPrompt(g, 'invalid_time_try_again');
      return res.type('text/xml').send(twiml.toString());
    }
    
    session.data.hhmm = d;
    
    if (session.data.duplicateType === 'driver') {
      // For driver, we're done collecting time info
      patchSession(callSid, { step: 'manage_duplicate_confirm', data: session.data });
  const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 6, action: '/voice/manage/duplicate/confirm' });
  playPrompt(g, 'press_1_confirm_2_restart');
      return res.type('text/xml').send(twiml.toString());
    } else {
      // For rider, we need latest time too
      patchSession(callSid, { step: 'manage_duplicate_time_latest', data: session.data });
  const g = twiml.gather({ input: 'dtmf', numDigits: 4, timeout: 8, action: '/voice/manage/duplicate/time-latest' });
  playPrompt(g, 'time_enter_latest');
      return res.type('text/xml').send(twiml.toString());
    }
  } catch (error) {
  console.error('Error in duplicate-time flow:', error);
  playPrompt(twiml, 'error_generic_try_later');
    patchSession(callSid, { step: 'manage_main_menu', data: session.data });
    twiml.redirect('/voice/manage');
  }
});

duplicateRouter.post('/time-latest', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\d]/g, '');
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_duplicate_time_latest' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (!/^\d{4}$/.test(d)) {
  const g = twiml.gather({ input: 'dtmf', numDigits: 4, timeout: 8, action: '/voice/manage/duplicate/time-latest' });
  playPrompt(g, 'invalid_time_try_again');
  playPrompt(g, 'time_enter_latest');
      return res.type('text/xml').send(twiml.toString());
    }
    
    session.data.hhmm_latest = d;
    patchSession(callSid, { step: 'manage_duplicate_confirm', data: session.data });
    const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 6, action: '/voice/manage/duplicate/confirm' });
    playPrompt(g, 'press_1_confirm_2_restart');
    return res.type('text/xml').send(twiml.toString());
  } catch (error) {
  console.error('Error in duplicate-time-latest flow:', error);
  playPrompt(twiml, 'error_generic_try_later');
    patchSession(callSid, { step: 'manage_main_menu', data: session.data });
    twiml.redirect('/voice/manage');
  }
});

duplicateRouter.post('/confirm', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = (req.body.Caller || req.body.From || '').replace(/[^+\d]/g, '');
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_duplicate_confirm' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (d === '1') {
      // Confirm duplication
      const lastRide = session.data.selectedRide;
      const isDriver = session.data.duplicateType === 'driver';
      const dateDay = session.data.dateDay;
      
      if (isDriver) {
        // Duplicate ride offer
        const hhmm = session.data.hhmm;
        const depUtc = combineDateAndHHMM(DateTime.fromISO(dateDay), hhmm).toISO();
        
        const rec = await addOffer({
          driver_phone: from,
          direction: lastRide.direction,
          departure_time: depUtc,
          seats_male_only: lastRide.seats_male_only,
          seats_female_only: lastRide.seats_female_only,
          seats_unisex: lastRide.seats_unisex,
        });
        
        // Get matches and provide immediate feedback
        const reqs = await listOpenRequestsForOffer(rec);
        const matches = await matchNewOffer(rec, reqs);
        
        // Generic success prompt
        playPrompt(twiml, 'thanks_goodbye');
      } else {
        // Duplicate ride request
        const earliestUtc = combineDateAndHHMM(DateTime.fromISO(dateDay), session.data.hhmm).toISO();
        const latestUtc = combineDateAndHHMM(DateTime.fromISO(dateDay), session.data.hhmm_latest).toISO();
        
        const rec = await addRequest({
          rider_phone: from,
          direction: lastRide.direction,
          earliest_time: earliestUtc,
          latest_time: latestUtc,
          passengers_total: lastRide.passengers_total,
          couples_count: lastRide.couples_count,
          passengers_male: lastRide.passengers_male,
          passengers_female: lastRide.passengers_female,
          together: lastRide.together,
        });
        
        // Get matches and provide immediate feedback
        const offers = await listActiveOffersForRequest(rec);
        const matches = await matchNewRequest(rec, offers);
        
        // Generic success prompt
        playPrompt(twiml, 'thanks_goodbye');
      }
      
      patchSession(callSid, { step: 'manage_main_menu', data: {} });
      twiml.redirect('/voice/manage');
    } else {
      // Cancel duplication
  playPrompt(twiml, 'thanks_goodbye');
      patchSession(callSid, { step: 'manage_main_menu', data: {} });
      twiml.redirect('/voice/manage');
    }
  } catch (error) {
  console.error('Error in duplicate-confirm flow:', error);
  playPrompt(twiml, 'error_generic_try_later');
    patchSession(callSid, { step: 'manage_main_menu', data: {} });
    twiml.redirect('/voice/manage');
  }
  
  res.type('text/xml').send(twiml.toString());
});
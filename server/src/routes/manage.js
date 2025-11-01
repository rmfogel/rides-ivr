import { Router } from 'express';
import twilio from 'twilio';
import { say } from '../utils/twiml.js';
import { playPrompt } from '../utils/recordings.js';
import { getSession, patchSession } from '../store/session.js';
import { getActiveOffersByDriverPhone, getActiveRequestsByRiderPhone, cancelOffer, cancelRequest } from '../db/repo.js';
import { formatRideDetails } from '../utils/formatting.js';
import logger from '../utils/logger.js';

export const manageRouter = Router();

// Normalize phone number for Israeli system
function normalizeIsraeliPhone(phone) {
  if (!phone) return '';
  // Remove all non-digit and non-+ characters
  let cleaned = phone.replace(/[^+\d]/g, '');
  // Convert +972 to 0 for Israeli numbers
  if (cleaned.startsWith('+972')) {
    cleaned = '0' + cleaned.substring(4);
  }
  return cleaned;
}

// Management menu - entry point
manageRouter.post('/menu', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const phone = normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  const callSid = req.body.CallSid || 'no-sid';
  const digits = req.body.Digits || '';
  
  logger.info('Management menu accessed', { phone, callSid, digits });
  
  try {
    if (digits === '1') {
      // Option 1: Delete rides - check what type of rides the user has
      const offers = await getActiveOffersByDriverPhone(phone);
      const requests = await getActiveRequestsByRiderPhone(phone);
      
      if (offers.length === 0 && requests.length === 0) {
        playPrompt(twiml, 'no_active_rides');
        playPrompt(twiml, 'thanks_goodbye');
        twiml.hangup();
      } else if (offers.length > 0 && requests.length === 0) {
        // Only driver rides
        patchSession(callSid, { 
          step: 'manage_delete_driver_rides', 
          data: { offers, currentIndex: 0, phone } 
        });
        twiml.redirect('/voice/manage/delete-rides');
      } else if (requests.length > 0 && offers.length === 0) {
        // Only rider rides
        patchSession(callSid, { 
          step: 'manage_delete_rider_rides', 
          data: { requests, currentIndex: 0, phone } 
        });
        twiml.redirect('/voice/manage/delete-rides');
      } else {
        // Both types - ask which to manage
        patchSession(callSid, { 
          step: 'manage_choose_ride_type', 
          data: { offers, requests, phone } 
        });
        const gather = twiml.gather({
          input: 'dtmf',
          numDigits: 1,
          timeout: 10,
          action: '/voice/manage/choose-type'
        });
        playPrompt(gather, 'choose_driver_or_rider_rides');
        playPrompt(twiml, 'thanks_goodbye');
        twiml.hangup();
      }
    } else {
      // Show menu
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 1,
        timeout: 10,
        action: '/voice/manage/menu'
      });
      playPrompt(gather, 'manage_menu');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    }
  } catch (error) {
    logger.error('Error in management menu', { error: error.message });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Choose ride type (driver or rider)
manageRouter.post('/choose-type', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid || 'no-sid';
  const digits = req.body.Digits || '';
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_choose_ride_type') {
    twiml.redirect('/voice/manage/menu');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (digits === '1') {
      // Manage driver rides
      patchSession(callSid, { 
        step: 'manage_delete_driver_rides', 
        data: { ...session.data, currentIndex: 0 } 
      });
      twiml.redirect('/voice/manage/delete-rides');
    } else if (digits === '2') {
      // Manage rider rides
      patchSession(callSid, { 
        step: 'manage_delete_rider_rides', 
        data: { ...session.data, currentIndex: 0 } 
      });
      twiml.redirect('/voice/manage/delete-rides');
    } else {
      // Invalid input
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 1,
        timeout: 10,
        action: '/voice/manage/choose-type'
      });
      playPrompt(gather, 'invalid_input');
      playPrompt(gather, 'choose_driver_or_rider_rides');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    }
  } catch (error) {
    logger.error('Error choosing ride type', { error: error.message });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// List rides for deletion
manageRouter.post('/delete-rides', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid || 'no-sid';
  const digits = req.body.Digits || '';
  let session = getSession(callSid);
  
  if (!session || (!session.step.includes('manage_delete'))) {
    twiml.redirect('/voice/manage/menu');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    const isDriver = session.step === 'manage_delete_driver_rides';
    const rides = isDriver ? session.data.offers : session.data.requests;
    let currentIndex = session.data.currentIndex || 0;
    
    // Handle input
    if (digits === '1') {
      // Delete this ride
      const ride = rides[currentIndex];
      if (ride) {
        patchSession(callSid, { 
          step: 'manage_confirm_delete', 
          data: { ...session.data, selectedRide: ride, isDriver } 
        });
        const gather = twiml.gather({
          input: 'dtmf',
          numDigits: 1,
          timeout: 10,
          action: '/voice/manage/confirm-delete'
        });
        playPrompt(gather, 'confirm_delete_ride');
        playPrompt(twiml, 'thanks_goodbye');
        twiml.hangup();
        return res.type('text/xml').send(twiml.toString());
      }
    } else if (digits === '2') {
      // Next ride
      currentIndex = (currentIndex + 1) % rides.length;
      patchSession(callSid, { 
        step: session.step, 
        data: { ...session.data, currentIndex } 
      });
    } else if (digits === '9') {
      // Return to menu
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Display current ride
    if (rides.length === 0) {
      playPrompt(twiml, 'no_active_rides');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else {
      const ride = rides[currentIndex];
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 1,
        timeout: 10,
        action: '/voice/manage/delete-rides'
      });
      
      // Announce ride details (simplified for now)
      playPrompt(gather, 'ride_details_intro');
      
      // Options
      playPrompt(gather, 'press_1_delete_2_next_9_exit');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    }
  } catch (error) {
    logger.error('Error in delete rides flow', { error: error.message });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Confirm deletion
manageRouter.post('/confirm-delete', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid || 'no-sid';
  const digits = req.body.Digits || '';
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_confirm_delete' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage/menu');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (digits === '1') {
      // Confirm deletion
      const ride = session.data.selectedRide;
      const isDriver = session.data.isDriver;
      
      if (isDriver) {
        await cancelOffer(ride.id);
      } else {
        await cancelRequest(ride.id);
      }
      
      logger.info('Ride deleted', { rideId: ride.id, isDriver, phone: session.data.phone });
      playPrompt(twiml, 'ride_deleted_successfully');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else {
      // Cancel deletion, return to list
      const step = session.data.isDriver ? 'manage_delete_driver_rides' : 'manage_delete_rider_rides';
      patchSession(callSid, { 
        step, 
        data: { ...session.data, selectedRide: null } 
      });
      twiml.redirect('/voice/manage/delete-rides');
    }
  } catch (error) {
    logger.error('Error confirming deletion', { error: error.message });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Handle listing of rides for cancellation or duplication
manageRouter.post('/list-rides', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || !session.step.startsWith('manage_list')) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    let index = session.currentIndex || 0;
    const isCancel = session.step === 'manage_list_rides';
    const isDuplicate = session.step === 'manage_list_to_duplicate';
    
    // If digits received, process them
    if (d) {
      if (d === '1') {
        // Select this ride
        if (isCancel) {
          if (session.data.cancelType === 'driver') {
            const ride = session.data.offers[index];
            if (ride) {
              session.data.selectedRide = ride;
              patchSession(callSid, { step: 'manage_confirm_cancel', data: session.data });
              const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 8, action: '/voice/manage/confirm-cancel' });
              playPrompt(g, 'press_1_confirm_2_restart');
              return res.type('text/xml').send(twiml.toString());
            }
          } else {
            const ride = session.data.requests[index];
            if (ride) {
              session.data.selectedRide = ride;
              patchSession(callSid, { step: 'manage_confirm_cancel', data: session.data });
              const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 8, action: '/voice/manage/confirm-cancel' });
              playPrompt(g, 'press_1_confirm_2_restart');
              return res.type('text/xml').send(twiml.toString());
            }
          }
        }
        // Logic for duplicating rides
        if (isDuplicate) {
          const lastRide = session.data.lastRide;
          if (lastRide) {
            session.data.selectedRide = lastRide;
            patchSession(callSid, { step: 'manage_duplicate_date', data: session.data });
            const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 6, action: '/voice/manage/duplicate-date' });
            const isOffer = session.data.duplicateType === 'driver';
            playPrompt(g, 'press_1_confirm_2_restart');
            return res.type('text/xml').send(twiml.toString());
          }
        }
      } else if (d === '2') {
        // Next ride
        if (isCancel) {
          const items = session.data.cancelType === 'driver' ? session.data.offers : session.data.requests;
          index = (index + 1) % items.length;
          patchSession(callSid, { currentIndex: index });
        }
      } else if (d === '9') {
        // Return to menu
        patchSession(callSid, { step: 'manage_main_menu', data: session.data });
        twiml.redirect('/voice/manage');
        return res.type('text/xml').send(twiml.toString());
      }
    }
    
    // Display current ride
    if (isCancel) {
      const items = session.data.cancelType === 'driver' ? session.data.offers : session.data.requests;
      if (!items || index >= items.length) {
  playPrompt(twiml, 'info_not_available');
        patchSession(callSid, { step: 'manage_main_menu', data: session.data });
        twiml.redirect('/voice/manage');
        return res.type('text/xml').send(twiml.toString());
      }
      
      const ride = items[index];
      const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 8, action: '/voice/manage/list-rides' });
      const isOffer = session.data.cancelType === 'driver';
  playPrompt(g, 'press_1_confirm_2_restart');
    }
    
    // If we're listing rides for duplication, similar logic would go here
    
  } catch (error) {
    console.error('Error in list-rides flow:', error);
  playPrompt(twiml, 'error_generic_try_later');
    twiml.redirect('/voice/manage');
  }
  
  res.type('text/xml').send(twiml.toString());
});

manageRouter.post('/confirm-cancel', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid || 'no-sid';
  const d = (req.body.Digits || '').trim();
  let session = getSession(callSid);
  
  if (!session || session.step !== 'manage_confirm_cancel' || !session.data.selectedRide) {
    twiml.redirect('/voice/manage');
    return res.type('text/xml').send(twiml.toString());
  }
  
  try {
    if (d === '1') {
      // Confirm cancellation
      const ride = session.data.selectedRide;
      const isOffer = session.data.cancelType === 'driver';
      
      if (isOffer) {
        await cancelOffer(ride.id);
  playPrompt(twiml, 'thanks_goodbye');
      } else {
        await cancelRequest(ride.id);
  playPrompt(twiml, 'thanks_goodbye');
      }
      
      patchSession(callSid, { step: 'manage_main_menu', data: session.data });
      twiml.redirect('/voice/manage');
    } else {
      // Return without cancelling
      patchSession(callSid, { step: 'manage_main_menu', data: session.data });
      twiml.redirect('/voice/manage');
    }
  } catch (error) {
    console.error('Error in confirm-cancel flow:', error);
  playPrompt(twiml, 'error_generic_try_later');
    patchSession(callSid, { step: 'manage_main_menu', data: session.data });
    twiml.redirect('/voice/manage');
  }
  
  res.type('text/xml').send(twiml.toString());
});
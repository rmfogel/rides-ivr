import { Router } from 'express';
import twilio from 'twilio';
import { say } from '../utils/twiml.js';
import { getSession, patchSession } from '../store/session.js';
import { getActiveOffersByDriverPhone, getActiveRequestsByRiderPhone, cancelOffer, cancelRequest } from '../db/repo.js';
import { formatRideDetails } from '../utils/formatting.js';

export const manageRouter = Router();

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
              say(g, `Are you sure you want to cancel this ride: ${formatRideDetails(ride, true)}? Press 1 to confirm cancellation. Press 2 to return.`);
              return res.type('text/xml').send(twiml.toString());
            }
          } else {
            const ride = session.data.requests[index];
            if (ride) {
              session.data.selectedRide = ride;
              patchSession(callSid, { step: 'manage_confirm_cancel', data: session.data });
              const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 8, action: '/voice/manage/confirm-cancel' });
              say(g, `Are you sure you want to cancel this ride request: ${formatRideDetails(ride, false)}? Press 1 to confirm cancellation. Press 2 to return.`);
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
            say(g, `You are duplicating this ${isOffer ? 'ride' : 'request'}: ${formatRideDetails(lastRide, isOffer)}. To proceed press 1, to return press 9.`);
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
        say(twiml, 'No rides available.');
        patchSession(callSid, { step: 'manage_main_menu', data: session.data });
        twiml.redirect('/voice/manage');
        return res.type('text/xml').send(twiml.toString());
      }
      
      const ride = items[index];
      const g = twiml.gather({ input: 'dtmf', numDigits: 1, timeout: 8, action: '/voice/manage/list-rides' });
      const isOffer = session.data.cancelType === 'driver';
      say(g, `Ride ${index + 1} of ${items.length}: ${formatRideDetails(ride, isOffer)}. Press 1 to select this ride. Press 2 for the next ride. Press 9 to return.`);
    }
    
    // If we're listing rides for duplication, similar logic would go here
    
  } catch (error) {
    console.error('Error in list-rides flow:', error);
    say(twiml, 'Sorry, there was an error processing your request. Please try again later.');
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
        say(twiml, 'Your ride has been cancelled. Any pending matches have been notified.');
      } else {
        await cancelRequest(ride.id);
        say(twiml, 'Your ride request has been cancelled.');
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
    say(twiml, 'Sorry, there was an error cancelling your ride. Please try again later.');
    patchSession(callSid, { step: 'manage_main_menu', data: session.data });
    twiml.redirect('/voice/manage');
  }
  
  res.type('text/xml').send(twiml.toString());
});
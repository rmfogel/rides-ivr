import { Router } from 'express';
import twilio from 'twilio';
import { say } from '../utils/twiml.js';
import { playPrompt, playHHMM, playDigits } from '../utils/recordings.js';
import { 
  getActiveOffersByDriverPhone, 
  getActiveRequestsByRiderPhone, 
  cancelOffer, 
  cancelRequest,
  getMatchesByOfferId,
  getMatchesByRequestId
} from '../db/repo.js';
import { formatRideDetails } from '../utils/formatting.js';
import logger from '../utils/logger.js';
import { DateTime } from 'luxon';
import { TZ } from '../utils/time.js';

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

/**
 * Helper function to describe a ride (offer or request) using audio prompts
 */
async function describeRide(twimlNode, ride, isOffer) {
  // Direction
  if (ride.direction === 'FROM') {
    playPrompt(twimlNode, 'direction_from'); // מהישוב
  } else {
    playPrompt(twimlNode, 'direction_to'); // לישוב
  }
  
  if (isOffer) {
    // For offers: departure time
    const departureTime = DateTime.fromJSDate(ride.departure_time).setZone(TZ);
    playPrompt(twimlNode, 'departure_at'); // יציאה בשעה
    playHHMM(twimlNode, departureTime.toFormat('HHmm'));
  } else {
    // For requests: time window
    const earliestTime = DateTime.fromJSDate(ride.earliest_time).setZone(TZ);
    const latestTime = DateTime.fromJSDate(ride.latest_time).setZone(TZ);
    playPrompt(twimlNode, 'time_window'); // בין השעות
    playHHMM(twimlNode, earliestTime.toFormat('HHmm'));
    playPrompt(twimlNode, 'and');
    playHHMM(twimlNode, latestTime.toFormat('HHmm'));
  }
}

// Management menu - entry point from main menu option 3
manageRouter.post('/menu', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const phone = normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  
  logger.info('Management menu accessed', { phone, callSid: req.body.CallSid });
  
  try {
    // Get active rides for this phone number
    const offers = await getActiveOffersByDriverPhone(phone);
    const requests = await getActiveRequestsByRiderPhone(phone);
    const totalRides = offers.length + requests.length;
    
    if (totalRides === 0) {
      // No active rides
      playPrompt(twiml, 'no_active_rides');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else if (totalRides === 1) {
      // Only one ride - go straight to asking if they want to delete it
      const ride = offers.length > 0 ? offers[0] : requests[0];
      const isOffer = offers.length > 0;
      
      // Show notice about no editing
      playPrompt(twiml, 'cannot_edit_must_delete_recreate');
      
      // Describe the ride
      await describeRide(twiml, ride, isOffer);
      
      // Ask if they want to delete
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 1,
        timeout: 10,
        action: `/voice/manage/delete-single?id=${ride.id}&type=${isOffer ? 'offer' : 'request'}`
      });
      playPrompt(gather, 'press_1_yes_delete_2_cancel');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else if (offers.length > 0 && requests.length === 0) {
      // Multiple driver rides only
      twiml.redirect(`/voice/manage/list-rides?type=offer&index=0&phone=${encodeURIComponent(phone)}`);
    } else if (requests.length > 0 && offers.length === 0) {
      // Multiple rider rides only
      twiml.redirect(`/voice/manage/list-rides?type=request&index=0&phone=${encodeURIComponent(phone)}`);
    } else {
      // Both types - ask which to manage
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 1,
        timeout: 10,
        action: `/voice/manage/choose-type?phone=${encodeURIComponent(phone)}`
      });
      playPrompt(gather, 'choose_driver_or_rider_rides');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    }
  } catch (error) {
    logger.error('Error in management menu', { error: error.message, stack: error.stack });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Choose ride type (driver or rider)
manageRouter.post('/choose-type', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const digits = req.body.Digits || '';
  const phone = req.query.phone || normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  
  try {
    if (digits === '1') {
      // Manage driver rides (offers)
      twiml.redirect(`/voice/manage/list-rides?type=offer&index=0&phone=${encodeURIComponent(phone)}`);
    } else if (digits === '2') {
      // Manage rider rides (requests)
      twiml.redirect(`/voice/manage/list-rides?type=request&index=0&phone=${encodeURIComponent(phone)}`);
    } else {
      // Invalid input
      const gather = twiml.gather({
        input: 'dtmf',
        numDigits: 1,
        timeout: 10,
        action: `/voice/manage/choose-type?phone=${encodeURIComponent(phone)}`
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

// List rides with navigation
manageRouter.post('/list-rides', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const digits = req.body.Digits || '';
  const type = req.query.type || '';
  let index = parseInt(req.query.index || '0', 10);
  const phone = req.query.phone || normalizeIsraeliPhone(req.body.Caller || req.body.From || '');
  
  logger.info('List rides', { phone, type, index, digits });
  
  try {
    // Get rides
    const rides = type === 'offer' 
      ? await getActiveOffersByDriverPhone(phone)
      : await getActiveRequestsByRiderPhone(phone);
    
    if (rides.length === 0) {
      playPrompt(twiml, 'no_active_rides');
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Handle input
    if (digits === '1') {
      // Delete this ride
      const ride = rides[index];
      if (ride) {
        twiml.redirect(`/voice/manage/confirm-delete?id=${ride.id}&type=${type}&phone=${encodeURIComponent(phone)}`);
        return res.type('text/xml').send(twiml.toString());
      }
    } else if (digits === '2') {
      // Next ride
      index = (index + 1) % rides.length;
    } else if (digits === '9') {
      // Exit
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }
    
    // Display current ride
    const ride = rides[index];
    
    // Show notice about no editing
    playPrompt(twiml, 'cannot_edit_must_delete_recreate');
    
    // Describe the ride
    await describeRide(twiml, ride, type === 'offer');
    
    // Options
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/manage/list-rides?type=${type}&index=${index}&phone=${encodeURIComponent(phone)}`
    });
    playPrompt(gather, 'press_1_delete_2_next_9_exit');
    playPrompt(twiml, 'thanks_goodbye');
    twiml.hangup();
  } catch (error) {
    logger.error('Error in list rides', { error: error.message, stack: error.stack });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Delete a single ride (when there's only one)
manageRouter.post('/delete-single', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const digits = req.body.Digits || '';
  const id = req.query.id || '';
  const type = req.query.type || '';
  
  logger.info('Delete single ride', { id, type, digits });
  
  try {
    if (digits === '1') {
      // User confirmed deletion
      twiml.redirect(`/voice/manage/do-delete?id=${id}&type=${type}`);
    } else {
      // User cancelled
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    }
  } catch (error) {
    logger.error('Error in delete single', { error: error.message });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Confirm deletion
manageRouter.post('/confirm-delete', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const id = req.query.id || '';
  const type = req.query.type || '';
  const phone = req.query.phone || '';
  
  logger.info('Confirm delete ride', { id, type });
  
  try {
    // Check if ride has active matches
    const matches = type === 'offer' 
      ? await getMatchesByOfferId(id)
      : await getMatchesByRequestId(id);
    
    const activeMatches = matches.filter(m => 
      m.status === 'accepted' || m.status === 'pending' || m.status === 'notified'
    );
    
    if (activeMatches.length > 0) {
      // Ride has active matches - warn user
      playPrompt(twiml, 'ride_has_match_notify_other'); // הנסיעה שובצה! עליך ליידע את הצד השני
      playPrompt(twiml, 'match_will_be_cancelled'); // השיבוץ יבוטל ויפתח מחדש לאחרים
    }
    
    const gather = twiml.gather({
      input: 'dtmf',
      numDigits: 1,
      timeout: 10,
      action: `/voice/manage/do-delete?id=${id}&type=${type}&phone=${encodeURIComponent(phone)}`
    });
    playPrompt(gather, 'press_1_yes_delete_2_cancel');
    playPrompt(twiml, 'thanks_goodbye');
    twiml.hangup();
  } catch (error) {
    logger.error('Error confirming deletion', { error: error.message, stack: error.stack });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Actually delete the ride
manageRouter.post('/do-delete', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const digits = req.body.Digits || '';
  const id = req.query.id || '';
  const type = req.query.type || '';
  
  logger.info('Do delete ride', { id, type, digits });
  
  try {
    if (digits === '1' || digits === '') {
      // Confirm deletion (or came from delete-single)
      
      // Check if ride has active matches
      const matches = type === 'offer' 
        ? await getMatchesByOfferId(id)
        : await getMatchesByRequestId(id);
      
      const hasActiveMatches = matches.some(m => 
        m.status === 'accepted' || m.status === 'pending' || m.status === 'notified'
      );
      
      // Delete the ride (this will also cancel associated matches via cancelOffer/cancelRequest)
      if (type === 'offer') {
        await cancelOffer(id);
      } else {
        await cancelRequest(id);
      }
      
      logger.info('Ride deleted successfully', { id, type, hadMatches: hasActiveMatches });
      
      if (hasActiveMatches) {
        playPrompt(twiml, 'ride_with_match_deleted'); // נסיעה משובצת נמחקה בהצלחה
      } else {
        playPrompt(twiml, 'ride_deleted_successfully');
      }
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    } else {
      // User cancelled deletion
      playPrompt(twiml, 'thanks_goodbye');
      twiml.hangup();
    }
  } catch (error) {
    logger.error('Error deleting ride', { error: error.message, stack: error.stack });
    playPrompt(twiml, 'error_generic_try_later');
    twiml.hangup();
  }
  
  res.type('text/xml').send(twiml.toString());
});
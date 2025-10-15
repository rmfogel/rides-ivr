// Helpers to keep voice consistent with language support
import logger from './logger.js';
import { prepareHebrewText, HEBREW_ALTERNATIVES, getCompatibleText } from './hebrewHelper.js';
import { convertToTwilioFriendlyHebrew } from './twilioHebrewMapper.js';
export function say(twimlNode, text, isHebrew = false) {
  if (isHebrew) {
    try {
      // Convert Hebrew text to a more Twilio-friendly format
      const twilioFriendlyText = convertToTwilioFriendlyHebrew(text);
      logger.debug('Converted Hebrew text', {
        original: text,
        converted: twilioFriendlyText
      });

      // Preferred: Use Amazon Polly Hebrew voice without language attribute
      // Twilio throws warnings if language is not one of the built-in list
      twimlNode.say({ voice: 'Polly.Carmit' }, twilioFriendlyText);
      logger.debug('Using Polly.Carmit for Hebrew text');
    } catch (e) {
      logger.warn('Polly.Carmit failed for Hebrew, falling back to Alice', {
        error: e.message
      });
      // Fallback to Alice without language attribute
      try {
        twimlNode.say({ voice: 'alice' }, text);
      } catch (e2) {
        logger.error('Failed to render Hebrew even with Alice', { error: e2.message });
        // Ultimate fallback - short English prompt
        twimlNode.say({ voice: 'Polly.Joanna', language: 'en-US' }, 'Please press numbers to continue.');
      }
    }
  } else {
    // English: Polly Joanna with proper language attribute
    twimlNode.say({ voice: 'Polly.Joanna', language: 'en-US' }, text);
  }
}

export function gatherDigits(twiml, opts = {}) {
  const { numDigits = 1, timeout = 6, action = undefined } = opts;
  return twiml.gather({ input: 'dtmf', numDigits, timeout, action });
}

export function hangup(twiml) {
  twiml.hangup();
}

export function sayDigits(twimlNode, phone, isHebrew = false) {
  const digits = (phone || '').replace(/[^\d+]/g, '').split('').join(' ');

  if (isHebrew) {
    try {
      // Use Polly Carmit (no language attribute) for Hebrew
      twimlNode.say({ voice: 'Polly.Carmit' }, 'מספר הטלפון');
      twimlNode.say({ voice: 'Polly.Carmit' }, digits);
      logger.debug('Using Carmit for Hebrew phone digits', { phone });
    } catch (e) {
      logger.warn('Carmit failed for Hebrew digits, falling back to Alice', { error: e.message });
      try {
        twimlNode.say({ voice: 'alice' }, 'מספר הטלפון');
        twimlNode.say({ voice: 'alice' }, digits);
      } catch (e2) {
        logger.error('Failed to say digits in Hebrew with Alice; falling back to English', { error: e2.message });
        twimlNode.say({ voice: 'Polly.Joanna', language: 'en-US' }, `The phone number is: ${digits}`);
      }
    }
  } else {
    twimlNode.say({ voice: 'Polly.Joanna', language: 'en-US' }, `The driver's phone number is: ${digits}`);
  }
}

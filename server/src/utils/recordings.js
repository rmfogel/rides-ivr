// Helpers for using recorded audio prompts (numeric filenames) instead of TTS
// All audio files are expected under /static/audio/he/<ID>.mp3 (served from server/public)
import path from 'path';
import fs from 'fs';
import url from 'url';
import logger from './logger.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', '..', 'public');

// Map of logical keys to numeric file IDs (as strings, zero-padded if desired)
// Keep this in sync with public/audio/he/dictionary.json
export const PROMPT_IDS = {
  // General
  welcome: '001',
  main_menu: '002',
  no_input_goodbye: '003',
  invalid_input: '004',
  not_implemented: '005',
  start_rider_request: '010',
  start_driver_offer: '011',
  direction_prompt: '020', // From settlement press 1, To press 2
  date_choice_prompt: '021', // Today 1, Tomorrow 2, Another date 3
  enter_date_six_digits: '022',
  invalid_date_try_again: '023',
  time_enter_earliest: '030',
  time_enter_latest: '031',
  time_enter_departure: '032',
  invalid_time_try_again: '033',
  preferred_time_question: '034',
  preferred_time_enter: '035',
  continue_without_preferred: '036',
  passenger_details_intro: '040',
  how_many_males: '041',
  how_many_females: '042',
  need_at_least_one_passenger: '043',
  couples_how_many: '044',
  too_many_couples: '045',
  together_question: '046',
  assuming_together: '047',
  how_many_children: '048',
  confirm_request_intro: '050',
  press_1_confirm_2_restart: '051',
  request_registered: '060',
  thanks_goodbye: '061',
  error_generic_try_later: '070',
  start_over: '071',
  driver_menu: '080',
  request_registered_keep_active: '081',
  offer_registered_keep_active: '082',

  // Error messages with context
  invalid_direction_retry: '090',
  invalid_date_option_retry: '091',
  invalid_time_format: '092',
  time_must_be_later: '093',
  time_outside_range: '094',
  invalid_passenger_count: '095',
  session_expired_restart: '096',
  
  // Driver-specific seat questions (NEW FLOW: total → male-only → female-only → auto-calculate anygender)
  driver_male_seats_question: '097',  // כמה מקומות לגברים יש לך? (DEPRECATED - kept for backwards compatibility)
  driver_female_seats_question: '098', // כמה מקומות לנשים יש לך? (DEPRECATED - kept for backwards compatibility)
  driver_total_seats_question: '099',  // כמה מקומות פנויים יש לך בסך הכל?
  driver_male_only_from_total: '110',  // כמה מתוכם לגברים בלבד?
  driver_female_only_from_total: '111', // כמה מתוכם לנשים בלבד?

  // Match / ringback
  great_news_found_ride: '100',
  driver_phone_number_is: '101',
  passenger_phone_number_is: '102',
  press_1_accept_2_decline: '103',
  press_1_accept_2_decline_3_hear_phone: '104',
  will_repeat: '105',

  // Outcomes
  rider_accepted: '120',
  rider_declined: '121',
  driver_accepted: '122',
  driver_declined: '123',
  info_not_available: '124',

  // Small building blocks
  the_time_is: '200',
  between: '201',
  and: '202',
  at: '203',
  from_settlement: '204',
  to_settlement: '205',
  passengers: '206',
  
  seats: '207',
  must_travel_together: '208',
  can_travel_separately: '209',
  including: '210',
  children: '211',

  // Digits and symbols
  digit_0: '3000',
  digit_1: '3001',
  digit_2: '3002',
  digit_3: '3003',
  digit_4: '3004',
  digit_5: '3005',
  digit_6: '3006',
  digit_7: '3007',
  digit_8: '3008',
  digit_9: '3009',
  plus: '3010', // for +972 etc
  colon: '3011',
};

export function recordingUrl(id, lang = 'he') {
  return `/static/audio/${lang}/${id}.mp3`;
}

function fileExists(relPath) {
  try {
    return fs.existsSync(path.join(publicDir, relPath));
  } catch {
    return false;
  }
}

export function playPrompt(twimlNode, keyOrId, lang = 'he') {
  const id = PROMPT_IDS[keyOrId] || keyOrId; // allow passing numeric id directly
  const rel = `audio/${lang}/${id}.mp3`;
  if (!fileExists(rel)) {
    logger.warn('Recording file not found, Twilio may 404', { id, rel });
  }
  twimlNode.play(recordingUrl(id, lang));
}

export function playSequence(twimlNode, keysOrIds, lang = 'he') {
  for (const k of keysOrIds) {
    playPrompt(twimlNode, k, lang);
  }
}

export function gatherPlayPrompt(gatherNode, keyOrId, lang = 'he') {
  playPrompt(gatherNode, keyOrId, lang);
}

export function playHHMM(twimlNode, hhmm, lang = 'he') {
  // Expect hhmm like '1530' -> play '1 5 : 3 0'
  const s = String(hhmm || '').padStart(4, '0');
  const parts = [s[0], s[1], 'colon', s[2], s[3]];
  for (const p of parts) {
    if (p === 'colon') {
      playPrompt(twimlNode, 'colon', lang);
    } else {
      playPrompt(twimlNode, `digit_${p}`, lang);
    }
  }
}

export function playDigits(twimlNode, value, lang = 'he') {
  // Plays phone numbers or numeric strings, including leading +
  const s = String(value || '');
  for (const ch of s) {
    if (ch === '+') {
      playPrompt(twimlNode, 'plus', lang);
    } else if (/\d/.test(ch)) {
      playPrompt(twimlNode, `digit_${ch}`, lang);
    }
  }
}

export default {
  PROMPT_IDS,
  recordingUrl,
  playPrompt,
  playSequence,
  gatherPlayPrompt,
  playDigits,
  playHHMM,
};

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

  // Management menu
  manage_menu: '130',
  no_active_rides: '131',
  choose_driver_or_rider_rides: '132',
  ride_details_intro: '133',
  press_1_delete_2_next_9_exit: '134',
  confirm_delete_ride: '135',
  ride_deleted_successfully: '136',
  
  // New management prompts
  cannot_edit_must_delete_recreate: '140', // אי אפשר לערוך נסיעה. יש למחוק וליצור מחדש
  ride_has_match_notify_other: '141', // הנסיעה שובצה! עליך ליידע את הצד השני
  match_will_be_cancelled: '142', // השיבוץ יבוטל ויפתח מחדש לאחרים
  press_1_yes_delete_2_cancel: '143', // לחץ 1 למחיקה, 2 לביטול
  ride_with_match_deleted: '144', // נסיעה משובצת נמחקה בהצלחה
  direction_from: '145', // מהישוב
  direction_to: '146', // לישוב
  on_date: '147', // בתאריך
  departure_at: '148', // יציאה בשעה
  time_window: '149', // בין השעות

  // Small building blocks
  the_time_is: '200',
  between: '201',
  and: '202',
  at: '2030',
  from_settlement: '204',
  to_settlement: '205',
  passengers: '206',
  
  seats: '207',
  must_travel_together: '208',
  can_travel_separately: '209',
  including: '210',
  children: '211',

  // IVR Registration flow (NEW)
  registration_welcome: '250', // שלום! מספר זה לא רשום במערכת
  registration_record_name: '251', // אנא הקלט את שמך המלא לאחר הצפצוף
  registration_name_recorded: '252', // תודה! השם נקלט בהצלחה
  registration_choose_pin: '253', // כעת בחר סיסמה בת 4 ספרות לממשק האינטרנט
  registration_confirm_pin: '254', // אנא הזן שוב את הסיסמה לאישור
  registration_pin_mismatch: '255', // הסיסמאות אינן תואמות. ננסה שוב
  registration_pin_invalid: '256', // סיסמה לא תקינה. יש להזין 4 ספרות בלבד
  registration_complete: '257', // ההרשמה הושלמה בהצלחה! כעת תועבר לתפריט הראשי
  reset_pin_intro: '258', // איפוס סיסמה. הזן סיסמה חדשה בת 4 ספרות
  reset_pin_success: '259', // הסיסמה אופסה בהצלחה

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

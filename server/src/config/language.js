/**
 * Language configuration for the application
 */
import HEBREW_TRANSLATIONS from './hebrewTranslations.js';

// Default language for the application
export const DEFAULT_LANGUAGE = 'en';

// Available languages
export const LANGUAGES = {
  en: {
    name: 'English',
    code: 'en-US',
    voice: 'Polly.Joanna',
    rtl: false
  },
  he: {
    name: 'Hebrew',
    code: 'he-IL',
    voice: 'Polly.Carmit',
    rtl: true
  }
};

// Text translations for voice prompts
export const TRANSLATIONS = {
  welcome: {
    en: 'Welcome to the ride service.',
    he: HEBREW_TRANSLATIONS.welcome
  },
  mainMenu: {
    en: 'For driver press 1. For rider press 2. For management press 3.',
    he: HEBREW_TRANSLATIONS.mainMenu
  },
  invalidInput: {
    en: 'Invalid input.',
    he: HEBREW_TRANSLATIONS.invalidInput
  },
  goodbye: {
    en: 'Thank you for using our service. Goodbye.',
    he: HEBREW_TRANSLATIONS.goodbye
  },
  driverWelcome: {
    en: 'Hello driver, we are happy to see you.',
    he: HEBREW_TRANSLATIONS.driverWelcome
  },
  riderWelcome: {
    en: 'Hello rider, we are happy to see you.',
    he: HEBREW_TRANSLATIONS.riderWelcome
  },
  driverMenuPrompt: {
    en: 'To offer a ride press 1. To check matches press 2. To cancel a ride press 3.',
    he: HEBREW_TRANSLATIONS.driverMenuPrompt
  },
  riderMenuPrompt: {
    en: 'To request a ride press 1. To check matches press 2. To cancel a ride press 3.',
    he: HEBREW_TRANSLATIONS.riderMenuPrompt
  },
  // Additional translations from hebrewTranslations.js will be used as needed
};

// Helper function to get text in the specified language
export function getText(key, language = DEFAULT_LANGUAGE) {
  if (!TRANSLATIONS[key]) {
    console.warn(`Missing translation key: ${key}`);
    return key;
  }
  
  return TRANSLATIONS[key][language] || TRANSLATIONS[key][DEFAULT_LANGUAGE];
}

export default {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  TRANSLATIONS,
  getText
};
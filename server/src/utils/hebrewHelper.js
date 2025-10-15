/**
 * הגדרות חלופיות לתמיכה בעברית ב-Twilio
 * 
 * קובץ זה מספק אפשרויות חלופיות לעבודה עם עברית בממשק הקולי
 * במקרה שהגישה הסטנדרטית עם Polly לא עובדת כראוי
 */

/**
 * פונקציה להעברת טקסט עברי לתצוגה נכונה ב-Twilio
 * 
 * @param {string} text - טקסט בעברית
 * @returns {string} - טקסט מוכן לשימוש ב-Twilio
 */
export function prepareHebrewText(text) {
  if (!text) return '';
  
  // הסרת תווים בעייתיים
  let prepared = text
    .replace(/[^\w\s\u0590-\u05FF:,.?!]/g, '') // השאר רק תווים עבריים ותווי פיסוק נפוצים
    .trim();
  
  return prepared;
}

/**
 * פתרונות חלופיים לבעיות נפוצות עם עברית ב-Twilio
 */
export const HEBREW_ALTERNATIVES = {
  // טקסטים שעובדים טוב יותר עם שילוב תווים לטיניים
  welcomeAlt: "Shalom. ברוכים הבאים לשירות הנסיעות.",
  
  // טקסט מפושט יותר
  mainMenuSimplified: "להקיש 1 לנהג, 2 לנוסע, 3 לניהול",
  
  // חלוקה לחלקים קטנים יותר (לשימוש בקריאות נפרדות של .say())
  phonePrefix: "מספר טלפון",
  pressDigit: "הקש",
  forDriver: "לנהג",
  forRider: "לנוסע",
  forManagement: "לניהול",
  
  // הגדרות שיטות אלטרנטיביות
  methods: {
    // שימוש בקול אליס הסטנדרטי במקום פולי
    useAlice: true,
    
    // חלוקה למקטעים קצרים
    useSegments: true,
    
    // השתמש בתערובת של אנגלית ועברית
    useMixedLanguage: true
  }
};

/**
 * פונקציה המחזירה טקסט מותאם לפי רמת תאימות
 * 
 * @param {string} key - מפתח הטקסט
 * @param {string} originalText - הטקסט המקורי
 * @param {number} compatLevel - רמת תאימות (1-3)
 * @returns {string} - הטקסט המותאם
 */
export function getCompatibleText(key, originalText, compatLevel = 1) {
  // ככל שרמת התאימות גבוהה יותר, כך ההתאמה אגרסיבית יותר
  
  switch(compatLevel) {
    case 3: // התאמה מקסימלית - כמעט רק מספרים ומילים באנגלית
      if (key === 'mainMenu') return "For driver press 1. For rider press 2. For management press 3.";
      if (key === 'welcome') return "Welcome.";
      break;
      
    case 2: // התאמה בינונית - שילוב אנגלית ועברית בסיסית
      if (key === 'mainMenu') return HEBREW_ALTERNATIVES.mainMenuSimplified;
      if (key === 'welcome') return HEBREW_ALTERNATIVES.welcomeAlt;
      break;
      
    case 1: // התאמה מינימלית - עברית עם תיקונים קלים
    default:
      return prepareHebrewText(originalText);
  }
  
  // ברירת מחדל - החזר את הטקסט המקורי אם אין התאמה ספציפית
  return originalText;
}

export default {
  prepareHebrewText,
  HEBREW_ALTERNATIVES,
  getCompatibleText
};
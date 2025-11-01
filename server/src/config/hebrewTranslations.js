// Hebrew translations for the ride service
export const HEBREW_TRANSLATIONS = {
  // General messages
  welcome: 'ברוכים הבאים לשירות הנסיעות.',
  goodbye: 'תודה שהשתמשת בשירות שלנו. להתראות.',
  invalidInput: 'קלט לא תקין. נסו שוב.',
  processing: 'מעבד את הבקשה שלך, אנא המתן.',
  
  // Main menu
  mainMenu: 'לנהג הקש 1. לנוסע הקש 2. לעדכון נסיעות שנשמרו הקש 3.',
  
  // Driver flow
  driverWelcome: 'שלום נהג, אנו שמחים לראות אותך.',
  driverMenuPrompt: 'להצעת נסיעה הקש 1. לבדיקת התאמות הקש 2. לביטול נסיעה הקש 3.',
  offerRidePrompt: 'בחר את כיוון הנסיעה: מהפריפריה למרכז הקש 1, מהמרכז לפריפריה הקש 2.',
  seatsPrompt: 'הזן את מספר המושבים הזמינים ואז הקש סולמית.',
  datePrompt: 'הזן את תאריך הנסיעה בפורמט DDMM ואז הקש סולמית.',
  timePrompt: 'הזן את שעת היציאה בפורמט HHMM ואז הקש סולמית.',
  confirmOffer: 'נסיעה נרשמה בהצלחה. תודה!',
  noMatches: 'אין התאמות זמינות כרגע.',
  matchFound: 'נמצאה התאמה לנסיעה שלך.',
  matchesFound: 'נמצאו {count} התאמות לנסיעה שלך.',
  
  // Rider flow
  riderWelcome: 'שלום נוסע, אנו שמחים לראות אותך.',
  riderMenuPrompt: 'לבקשת נסיעה הקש 1. לבדיקת התאמות הקש 2. לביטול נסיעה הקש 3.',
  requestRidePrompt: 'בחר את כיוון הנסיעה: מהפריפריה למרכז הקש 1, מהמרכז לפריפריה הקש 2.',
  passengersPrompt: 'הזן את מספר הנוסעים ואז הקש סולמית.',
  earliestTimePrompt: 'הזן את השעה המוקדמת ביותר לנסיעה בפורמט HHMM ואז הקש סולמית.',
  latestTimePrompt: 'הזן את השעה המאוחרת ביותר לנסיעה בפורמט HHMM ואז הקש סולמית.',
  confirmRequest: 'בקשת נסיעה נרשמה בהצלחה. תודה!',
  
  // Match information
  matchDetails: 'פרטי ההתאמה: נסיעה ביום {date} בשעה {time}.',
  driverInfo: 'מספר הטלפון של הנהג הוא: {phone}',
  riderInfo: 'מספר הטלפון של הנוסע הוא: {phone}',
  
  // Management
  managementWelcome: 'ברוכים הבאים למערכת הניהול.',
  managementPrompt: 'למחיקת נסיעות הקש 1.',
  noActiveRides: 'אין לך נסיעות פעילות.',
  chooseDriverOrRiderRides: 'לניהול נסיעות כנהג הקש 1. לניהול נסיעות כנוסע הקש 2.',
  rideDetailsIntro: 'פרטי הנסיעה:',
  press1Delete2Next9Exit: 'למחיקת הנסיעה הקש 1. לנסיעה הבאה הקש 2. לחזרה הקש 9.',
  confirmDeleteRide: 'האם אתה בטוח שברצונך למחוק את הנסיעה? הקש 1 לאישור או 2 לביטול.',
  rideDeletedSuccessfully: 'הנסיעה נמחקה בהצלחה.',
  
  // Errors
  generalError: 'אירעה שגיאה. אנא נסה שוב מאוחר יותר.',
  invalidDate: 'תאריך לא תקין. אנא הזן שוב.',
  invalidTime: 'שעה לא תקינה. אנא הזן שוב.',
  invalidSeats: 'מספר מושבים לא תקין. אנא הזן שוב.',
  invalidPassengers: 'מספר נוסעים לא תקין. אנא הזן שוב.',
  
  // Phone numbers
  phoneNumberIs: 'מספר הטלפון הוא: '
};

export default HEBREW_TRANSLATIONS;
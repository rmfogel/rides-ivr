# עדכון: שימוש במידע משתמש בהקראת פרטי התאמות

## תיאור השינוי

המערכת עודכנה כך שבכל הקראה של פרטי התאמה (נהג לנוסע או נוסע לנהג), המערכת משתמשה בפונקציות `getOfferWithUser` ו-`getRequestWithUser` כדי לקבל את המידע המלא של המשתמש מהמסד נתונים במקום לבצע שאילתות נפרדות.

## יתרונות השינוי

1. **ביצועים משופרים**: במקום 2 שאילתות (אחד להצעה/בקשה ואחד למשתמש), מתבצעת שאילתה אחת עם join
2. **עקביות נתונים**: המידע מגיע מאותו מקור - אובייקט המשתמש המלא
3. **גמישות**: אם יתווספו שדות נוספים למשתמש (כמו כתובת, הערות, וכו'), הם יהיו זמינים אוטומטית
4. **תחזוקה קלה**: קוד פשוט ומרוכז יותר

## מקומות שעודכנו ב-voice.js

### 1. יבוא הפונקציות החדשות (שורות 1-22)
```javascript
import { 
  addRequest, 
  addOffer, 
  listActiveOffersForRequest, 
  listOpenRequestsForOffer, 
  getOfferById, 
  getRequestById,
  getOfferWithUser,     // <-- חדש
  getRequestWithUser,   // <-- חדש
  getUserByPhone, 
  updateMatchStatus,
  listPendingMatchesForPhone,
  listPendingMatchesForDriverPhone
} from '../db/repo.js';
```

### 2. הקראת פרטי נהג לנוסע אחרי יצירת בקשה (~שורה 1030)
**לפני:**
```javascript
const matchedOffer = await getOfferById(bestMatch.offer_id);
const driver = await getUserByPhone(matchedOffer.driver_phone);
```

**אחרי:**
```javascript
const matchedOffer = await getOfferWithUser(bestMatch.offer_id);
// המידע כבר כלול ב-matchedOffer.user
if (matchedOffer.user) {
  driverName = matchedOffer.user.name;
  driverPhone = matchedOffer.user.phone || matchedOffer.driver_phone;
}
```

### 3. הקראת פרטי נוסע לנהג אחרי יצירת הצעה (~שורה 1690)
**לפני:**
```javascript
const matchedRequest = await getRequestById(bestMatch.request_id);
const rider = await getUserByPhone(matchedRequest.rider_phone);
```

**אחרי:**
```javascript
const matchedRequest = await getRequestWithUser(bestMatch.request_id);
// המידע כבר כלול ב-matchedRequest.user
if (matchedRequest.user) {
  riderName = matchedRequest.user.name;
  riderPhone = matchedRequest.user.phone || matchedRequest.rider_phone;
}
```

### 4. הקראה חוזרת (ringback) לנוסע (~שורה 1925)
עודכן להשתמש ב-`getOfferWithUser` במקום `getOfferById` + `getUserByPhone`

### 5. הקראה חוזרת (ringback) לנהג (~שורה 1975)
עודכן להשתמש ב-`getRequestWithUser` במקום `getRequestById` + `getUserByPhone`

## דוגמת הקוד המעודכן

### הקראת פרטי נהג לנוסע:
```javascript
// Get the offer details with full user information
const matchedOffer = await getOfferWithUser(bestMatch.offer_id);

// Get driver information from the user object or fallback to phone lookup
let driverInfo = "an unknown driver";
let driverPhone = matchedOffer.driver_phone;
let driverName = null;

// Prefer user object data if available
if (matchedOffer.user) {
  driverName = matchedOffer.user.name;
  driverPhone = matchedOffer.user.phone || matchedOffer.driver_phone;
} else {
  // Fallback to separate query if user not populated
  const driver = await getUserByPhone(driverPhone);
  if (driver && driver.name) {
    driverName = driver.name;
  }
}

if (driverName) {
  driverInfo = driverName;
}

// Tell the rider about the match
playPrompt(twiml, 'great_news_found_ride');

// Play driver's name if available
if (driverName) {
  twiml.say({ voice: 'Polly.Joanna', language: 'en-US' }, driverName);
}

// Read out the phone number digit by digit
playPrompt(twiml, 'driver_phone_number_is');
playDigits(twiml, driverPhone);
```

## מבנה האובייקט המוחזר

### Offer עם User:
```javascript
{
  id: "...",
  user_id: "...",
  driver_phone: "+972...",
  direction: "north|south",
  departure_time: Date,
  seats_male_only: Number,
  seats_female_only: Number,
  seats_anygender: Number,
  status: "active|full|cancelled",
  created_at: Date,
  user: {  // <-- אובייקט המשתמש המלא
    id: "...",
    phone: "+972...",
    name: "...",
    declared_gender: "male|female",
    is_allowed: Boolean,
    created_at: Date,
    updated_at: Date
  }
}
```

### Request עם User:
```javascript
{
  id: "...",
  user_id: "...",
  rider_phone: "+972...",
  direction: "north|south",
  earliest_time: Date,
  latest_time: Date,
  preferred_time: Date,
  passengers_male: Number,
  passengers_female: Number,
  children_count: Number,
  passengers_total: Number,
  couples_count: Number,
  together: Boolean,
  status: "open|partial|matched|complete|cancelled",
  created_at: Date,
  user: {  // <-- אובייקט המשתמש המלא
    id: "...",
    phone: "+972...",
    name: "...",
    declared_gender: "male|female",
    is_allowed: Boolean,
    created_at: Date,
    updated_at: Date
  }
}
```

## Fallback ותמיכה לאחור

הקוד כולל fallback למקרים שבהם:
1. אין `user_id` (בקשות/הצעות ישנות)
2. ה-user object לא נטען בהצלחה
3. המשתמש לא קיים במסד הנתונים

במקרים אלה, המערכת חוזרת לשימוש ב-`getUserByPhone` כפי שהיה בעבר.

```javascript
// Prefer user object data if available
if (matchedOffer.user) {
  driverName = matchedOffer.user.name;
  driverPhone = matchedOffer.user.phone || matchedOffer.driver_phone;
} else {
  // Fallback to separate query if user not populated
  const driver = await getUserByPhone(driverPhone);
  if (driver && driver.name) {
    driverName = driver.name;
  }
}
```

## טכנולוגיה

השינוי משתמש ב-MongoDB aggregation pipeline עם `$lookup`:
```javascript
{
  $lookup: {
    from: 'users',
    localField: 'user_id',
    foreignField: '_id',
    as: 'user'
  }
}
```

פעולה זו מבצעת JOIN בין ה-collection של ההצעות/בקשות ל-collection של המשתמשים.

## בדיקות מומלצות

1. **בדיקה עם משתמש קיים**: נוסע/נהג עם שם במערכת
2. **בדיקה עם משתמש חדש**: נוסע/נהג שטרם נרשם
3. **בדיקה עם בקשה ישנה**: בקשה/הצעה ללא `user_id`
4. **בדיקת ringback**: קריאה חוזרת לנוסע ולנהג

## תאריך עדכון

אוקטובר 2025

## קבצים שעודכנו

- `server/src/routes/voice.js`
- `server/docs/USER-INFO-IN-MATCHES.md` (מסמך זה)

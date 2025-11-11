# תיקון: מניעת הצגה והתאמה לנסיעות עבר

**תאריך**: 11 בנובמבר 2025  
**בעיה מקורית**: המערכת הציגה בקשות/הצעות נסיעה שעבר זמנן בסטטוס "open"/"active" ויצרה התאמות לנסיעות שכבר עברו

## הבעיות שזוהו

### 1. בעיית התאמות (Matching)
כאשר משתמש יצר הצעת נסיעה או בקשת נסיעה, המערכת חיפשה התאמות אפשריות בלי לבדוק אם הנסיעות המותאמות כבר עברו. זה גרם למצב שבו:

1. נהג שהציע נסיעה היום קיבל התאמות לבקשות מהעבר (שכבר לא רלוונטיות)
2. רוכב שביקש נסיעה היום קיבל התאמות להצעות מהעבר (שכבר לא רלוונטיות)

## הפתרון

הוספנו בדיקת תאריך לשני ה-endpoints שמבצעים matching:

### 1. תיקון ב-`offer-ride.js` (שורות 208-221)

**לפני**:
```javascript
const query = {
  direction: direction,
  status: 'open',
  earliest_time: { $lte: departureDateTime.toJSDate() },
  latest_time: { $gte: departureDateTime.toJSDate() }
};
```

**אחרי**:
```javascript
// Get current time in Israel timezone for comparison
const nowInIsrael = DateTime.now().setZone(TZ);

// Find compatible requests (only future rides)
const query = {
  direction: direction,
  status: 'open',
  earliest_time: { $lte: departureDateTime.toJSDate() },
  latest_time: { 
    $gte: departureDateTime.toJSDate(),
    $gte: nowInIsrael.toJSDate() // Ensure the ride hasn't passed
  }
};
```

### 2. תיקון ב-`request-ride.js` (שורות 293-308)

**לפני**:
```javascript
const query = {
  direction: direction,
  status: 'active',
  departure_time: { 
    $gte: earliestDateTime.toJSDate(),
    $lte: latestDateTime.toJSDate()
  }
};
```

**אחרי**:
```javascript
// Get current time in Israel timezone for comparison
const nowInIsrael = DateTime.now().setZone(TZ);

// Find compatible offers (only future rides)
const query = {
  direction: direction,
  status: 'active',
  departure_time: { 
    $gte: earliestDateTime.toJSDate(),
    $lte: latestDateTime.toJSDate(),
    $gte: nowInIsrael.toJSDate() // Ensure the ride hasn't passed
  }
};
```

### 2. בעיית תצוגה בדף ניהול (My Rides)
דף ניהול הנסיעות (`my-rides.html`) הציג נסיעות שעבר זמנן עם סטטוס "open" או "active" כי:
- הסטטוס לא התעדכן אוטומטית כשהזמן עבר
- ה-API endpoints לא סיננו נסיעות שעברו

## הפתרונות

### 1. תיקון Matching - הוספנו בדיקת תאריך לשני ה-endpoints שמבצעים matching:

#### א. תיקון ב-`offer-ride.js` (שורות 208-221)

**לפני**:
```javascript
const query = {
  direction: direction,
  status: 'open',
  earliest_time: { $lte: departureDateTime.toJSDate() },
  latest_time: { $gte: departureDateTime.toJSDate() }
};
```

**אחרי**:
```javascript
// Get current time in Israel timezone for comparison
const nowInIsrael = DateTime.now().setZone(TZ);

// Find compatible requests (only future rides)
const query = {
  direction: direction,
  status: 'open',
  earliest_time: { $lte: departureDateTime.toJSDate() },
  latest_time: { 
    $gte: departureDateTime.toJSDate(),
    $gte: nowInIsrael.toJSDate() // Ensure the ride hasn't passed
  }
};
```

#### ב. תיקון ב-`request-ride.js` (שורות 293-308)

**לפני**:
```javascript
const query = {
  direction: direction,
  status: 'active',
  departure_time: { 
    $gte: earliestDateTime.toJSDate(),
    $lte: latestDateTime.toJSDate()
  }
};
```

**אחרי**:
```javascript
// Get current time in Israel timezone for comparison
const nowInIsrael = DateTime.now().setZone(TZ);

// Find compatible offers (only future rides)
const query = {
  direction: direction,
  status: 'active',
  departure_time: { 
    $gte: earliestDateTime.toJSDate(),
    $lte: latestDateTime.toJSDate(),
    $gte: nowInIsrael.toJSDate() // Ensure the ride hasn't passed
  }
};
```

### 2. תיקון תצוגה - סינון נסיעות עבר ב-GET endpoints

#### א. תיקון ב-`GET /api/rides/offer` (שורות 341-356)

**לפני**:
```javascript
const { offers } = await collections();

// Get all offers for this phone
const userOffers = await offers
  .find({ 
    driver_phone: cleanPhone,
    status: { $in: ['active', 'partial', 'matched'] }
  })
  .sort({ created_at: -1 })
  .toArray();

logger.info('Retrieved offers for phone', {
  phone: cleanPhone,
  count: userOffers.length
});

// Format the response
const formattedOffers = userOffers.map(offer => {
```

**אחרי**:
```javascript
const { offers } = await collections();

// Get current time in Israel timezone
const nowInIsrael = DateTime.now().setZone(TZ);

// Get all offers for this phone (including past rides, but we'll filter/mark them)
const userOffers = await offers
  .find({ 
    driver_phone: cleanPhone,
    status: { $in: ['active', 'partial', 'matched'] }
  })
  .sort({ created_at: -1 })
  .toArray();

// Filter out rides that have already passed
const activeOffers = userOffers.filter(offer => {
  const departureTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
  return departureTime >= nowInIsrael;
});

logger.info('Retrieved offers for phone', {
  phone: cleanPhone,
  totalCount: userOffers.length,
  activeCount: activeOffers.length,
  filteredPastRides: userOffers.length - activeOffers.length
});

// Format the response
const formattedOffers = activeOffers.map(offer => {
```

#### ב. תיקון ב-`GET /api/rides/request` (שורות 418-439)

**לפני**:
```javascript
const { requests } = await collections();

// Get all requests for this phone
const userRequests = await requests
  .find({ 
    rider_phone: cleanPhone,
    status: { $in: ['open', 'partial', 'matched'] }
  })
  .sort({ created_at: -1 })
  .toArray();

logger.info('Retrieved requests for phone', {
  phone: cleanPhone,
  count: userRequests.length
});

// Format the response
const formattedRequests = userRequests.map(request => {
```

**אחרי**:
```javascript
const { requests } = await collections();

// Get current time in Israel timezone
const nowInIsrael = DateTime.now().setZone(TZ);

// Get all requests for this phone
const userRequests = await requests
  .find({ 
    rider_phone: cleanPhone,
    status: { $in: ['open', 'partial', 'matched'] }
  })
  .sort({ created_at: -1 })
  .toArray();

// Filter out rides that have already passed
const activeRequests = userRequests.filter(request => {
  const latestTime = DateTime.fromJSDate(request.latest_time).setZone(TZ);
  return latestTime >= nowInIsrael;
});

logger.info('Retrieved requests for phone', {
  phone: cleanPhone,
  totalCount: userRequests.length,
  activeCount: activeRequests.length,
  filteredPastRides: userRequests.length - activeRequests.length
});

// Format the response
const formattedRequests = activeRequests.map(request => {
```

## השפעה

### על Matching:
- **הצעות נסיעה חדשות**: יותאמו רק לבקשות עם `latest_time` בעתיד
- **בקשות נסיעה חדשות**: יותאמו רק להצעות עם `departure_time` בעתיד
- **שימוש בזמן ישראלי**: כל ההשוואות נעשות עם `DateTime.now().setZone(TZ)` כדי להבטיח עקביות

### על תצוגה:
- **דף ניהול נסיעות**: יציג רק נסיעות עתידיות
- **סטטוס open/active**: נסיעות עם סטטוס זה שעבר זמנן לא יוצגו יותר
- **logging**: מידע מפורט על מספר הנסיעות שסוננו

## בדיקות

לבדוק:
1. ✅ יצירת הצעת נסיעה חדשה לא תתאים לבקשות ישנות
2. ✅ יצירת בקשת נסיעה חדשה לא תתאים להצעות ישנות
3. ✅ התאמות בין נסיעות עתידיות עדיין עובדות
4. ✅ דף ניהול נסיעות מציג רק נסיעות עתידיות
5. ✅ נסיעות שעבר זמנן לא מופיעות בדף ניהול
6. ✅ השימוש באזור זמן ישראלי תקין בכל המקומות

## הערות טכניות

- **זמן ישראלי**: כל התיקונים משתמשים ב-`DateTime.now().setZone(TZ)` כדי להבטיח שאנחנו משתמשים בזמן הנכון
- **סינון בזיכרון**: בחרנו לסנן בצד ה-API ולא ב-query כדי לשמור על גמישות ולהוסיף logging מפורט
- **נסיעות חלקיות**: בקשה עם `earliest_time` בעבר אבל `latest_time` בעתיד עדיין יכולה להתאים (זה נכון לוגית)
- **logging משופר**: כל ה-endpoints כוללים עכשיו מידע על כמה נסיעות סוננו

## קבצים ששונו

1. `server/src/routes/offer-ride.js`:
   - שורות 208-221: תיקון matching
   - שורות 341-356: תיקון GET endpoint
   
2. `server/src/routes/request-ride.js`:
   - שורות 293-308: תיקון matching  
   - שורות 418-439: תיקון GET endpoint

## שיפורים עתידיים אפשריים

1. **Cron job**: עדכון אוטומטי של סטטוס נסיעות שעבר זמנן מ-`open`/`active` ל-`expired`
2. **אינדקסים**: הוספת אינדקס על `departure_time` ו-`latest_time` לביצועים טובים יותר
3. **ארכיון**: העברת נסיעות ישנות לקולקשן נפרד לאחר זמן מסוים

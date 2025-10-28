# תיקון: שימוש במספר הטלפון של המשתמש במקום המספר מהבקשה/הצעה

## תיאור הבעיה
המערכת הייתה מקריאה את מספר הטלפון השמור בבקשת ההסעה (`rider_phone`) או בהצעת הנסיעה (`driver_phone`) במקום את מספר הטלפון השמור במופע של המשתמש בטבלת `users`.

## הפתרון
שונה הלוגיקה בכל המקומות שבהם המערכת מקריאה מספרי טלפון כך שתמיד תעדיף את מספר הטלפון ממופע המשתמש (`user.phone`) כאשר הוא זמין.

## שינויים שבוצעו

### 1. תהליך יצירת בקשת הסעה עם התאמה מיידית (שורה ~1043)
**לפני:**
```javascript
if (matchedOffer.user) {
  driverName = matchedOffer.user.name;
  driverPhone = matchedOffer.user.phone || matchedOffer.driver_phone;
}
```

**אחרי:**
```javascript
if (matchedOffer.user) {
  driverName = matchedOffer.user.name;
  // Always use the user's registered phone number when available
  if (matchedOffer.user.phone) {
    driverPhone = matchedOffer.user.phone;
  }
} else {
  // Fallback to separate query if user not populated
  const driver = await getUserByPhone(driverPhone);
  if (driver && driver.name) {
    driverName = driver.name;
  }
  if (driver && driver.phone) {
    driverPhone = driver.phone;
  }
}
```

### 2. תהליך יצירת הצעת נסיעה עם התאמה מיידית (שורה ~1698)
**לפני:**
```javascript
if (matchedRequest.user) {
  riderName = matchedRequest.user.name;
  riderPhone = matchedRequest.user.phone || matchedRequest.rider_phone;
}
```

**אחרי:**
```javascript
if (matchedRequest.user) {
  riderName = matchedRequest.user.name;
  // Always use the user's registered phone number when available
  if (matchedRequest.user.phone) {
    riderPhone = matchedRequest.user.phone;
  }
} else {
  // Fallback to separate query if user not populated
  const rider = await getUserByPhone(riderPhone);
  if (rider && rider.name) {
    riderName = rider.name;
  }
  if (rider && rider.phone) {
    riderPhone = rider.phone;
  }
}
```

### 3. תהליך ניהול התאמות קיימות לנהג (שורה ~1995)
**לפני:**
```javascript
if (request.user) {
  riderName = request.user.name;
  riderPhone = request.user.phone || request.rider_phone;
}
```

**אחרי:**
```javascript
if (request.user) {
  riderName = request.user.name;
  // Always use the user's registered phone number when available
  if (request.user.phone) {
    riderPhone = request.user.phone;
  }
} else {
  // Fallback to separate query if user not populated
  const rider = await getUserByPhone(riderPhone);
  if (rider && rider.name) {
    riderName = rider.name;
  }
  if (rider && rider.phone) {
    riderPhone = rider.phone;
  }
}
```

### 4. אישור התאמה על ידי נוסע - קבלה (שורה ~1768)
**לפני:**
```javascript
const offer = await getOfferById(offerId);
// ... קריאת offer.driver_phone ישירות
```

**אחרי:**
```javascript
const offer = await getOfferWithUser(offerId);
// Get the driver's phone number from user object if available
let driverPhone = offer.driver_phone;
if (offer.user && offer.user.phone) {
  driverPhone = offer.user.phone;
} else if (!offer.user) {
  // Fallback to user lookup if not populated
  const driver = await getUserByPhone(offer.driver_phone);
  if (driver && driver.phone) {
    driverPhone = driver.phone;
  }
}
```

### 5. אישור התאמה על ידי נוסע - שמיעת מספר מחדש (שורה ~1803)
**לפני:**
```javascript
const offer = await getOfferById(offerId);
twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(offer.driver_phone)}&type=driver`);
```

**אחרי:**
```javascript
const offer = await getOfferWithUser(offerId);
let driverPhone = offer.driver_phone;
if (offer.user && offer.user.phone) {
  driverPhone = offer.user.phone;
} else if (!offer.user) {
  const driver = await getUserByPhone(offer.driver_phone);
  if (driver && driver.phone) {
    driverPhone = driver.phone;
  }
}
twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(driverPhone)}&type=driver`);
```

### 6. אישור התאמה על ידי נהג - קבלה (שורה ~1843)
**לפני:**
```javascript
const request = await getRequestById(requestId);
// ... קריאת request.rider_phone ישירות
```

**אחרי:**
```javascript
const request = await getRequestWithUser(requestId);
let riderPhone = request.rider_phone;
if (request.user && request.user.phone) {
  riderPhone = request.user.phone;
} else if (!request.user) {
  const rider = await getUserByPhone(request.rider_phone);
  if (rider && rider.phone) {
    riderPhone = rider.phone;
  }
}
```

### 7. אישור התאמה על ידי נהג - שמיעת מספר מחדש (שורה ~1882)
**לפני:**
```javascript
const request = await getRequestById(requestId);
twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(request.rider_phone)}&type=passenger`);
```

**אחרי:**
```javascript
const request = await getRequestWithUser(requestId);
let riderPhone = request.rider_phone;
if (request.user && request.user.phone) {
  riderPhone = request.user.phone;
} else if (!request.user) {
  const rider = await getUserByPhone(request.rider_phone);
  if (rider && rider.phone) {
    riderPhone = rider.phone;
  }
}
twiml.redirect(`/voice/ringback-hear-phone?phone=${encodeURIComponent(riderPhone)}&type=passenger`);
```

## השפעה
- המערכת תמיד תקריא את מספר הטלפון הרשום של המשתמש מטבלת ה-users
- אם המשתמש לא קיים בטבלה, המערכת תשתמש במספר מהבקשה/הצעה כ-fallback
- זה מבטיח שמשתמשים שהתעדכן מספר הטלפון שלהם יקבלו את המספר הנכון

## קבצים ששונו
- `server/src/routes/voice.js`

תאריך: אוקטובר 28, 2025

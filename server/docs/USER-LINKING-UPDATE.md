# עדכון: קישור משתמשים לבקשות והצעות נסיעה

## תיאור השינוי

המערכת עודכנה כך שכל בקשת נסיעה (ride request) והצעת נסיעה (ride offer) מקושרות לאובייקט המשתמש במסד הנתונים באמצעות שדה `user_id`. זה מאפשר גישה מלאה לכל פרטי המשתמש (שם, מגדר מוצהר, וכו') דרך הבקשות וההצעות.

## שינויים שבוצעו

### 1. עדכון store.js (זיכרון מקומי)

**קובץ:** `server/src/store/store.js`

- **פונקציית `addRequest`**: מוסיפה את `user_id` לבקשה אם הוא קיים
- **פונקציית `addOffer`**: מוסיפה את `user_id` להצעה אם הוא קיים
- **פונקציית `upsertUser`**: מייצרת ID ייחודי למשתמש אם לא קיים
- **פונקציות חדשות**:
  - `getUserById(id)` - מחזירה משתמש לפי ID
  - `getUserByPhone(phone)` - מחזירה משתמש לפי טלפון
  - `getOfferWithUser(id)` - מחזירה הצעה עם מידע המשתמש המלא
  - `getRequestWithUser(id)` - מחזירה בקשה עם מידע המשתמש המלא

### 2. עדכון voice.js (לוגיקת IVR)

**קובץ:** `server/src/routes/voice.js`

**ביצירת בקשת נסיעה (rider-submit):**
```javascript
// Get or create user to link to the request
const user = await getUserByPhone(from);

const rideRequest = {
  rider_phone: from,
  // ... שאר השדות
};

// Link to user if exists
if (user && user.id) {
  rideRequest.user_id = user.id;
}
```

**ביצירת הצעת נסיעה (driver-submit):**
```javascript
// Get or create user to link to the offer
const user = await getUserByPhone(from);

const rideOffer = {
  driver_phone: from,
  // ... שאר השדות
};

// Link to user if exists
if (user && user.id) {
  rideOffer.user_id = user.id;
}
```

### 3. עדכון repo.js (MongoDB)

**קובץ:** `server/src/db/repo.js`

**פונקציית `addOffer`:**
- ממירה `user_id` ל-ObjectId אם מסופק כמחרוזת
- שומרת את `user_id` במסד הנתונים

**פונקציית `addRequest`:**
- ממירה `user_id` ל-ObjectId אם מסופק כמחרוזת
- שומרת את `user_id` במסד הנתונים

**פונקציית `normalize`:**
- ממירה `user_id` מ-ObjectId למחרוזת בהחזרת התוצאות

**פונקציות חדשות:**
- `getOfferWithUser(id)` - מחזירה הצעה עם מידע המשתמש המלא באמצעות MongoDB aggregation
- `getRequestWithUser(id)` - מחזירה בקשה עם מידע המשתמש המלא באמצעות MongoDB aggregation

שתי הפונקציות משתמשות ב-`$lookup` של MongoDB לביצוע join בין ה-collection של ההצעות/בקשות ל-collection של המשתמשים.

## שימוש

### גישה למידע המשתמש דרך בקשה או הצעה

**דרך רגילה (רק user_id):**
```javascript
const request = await getRequestById(requestId);
console.log(request.user_id); // ID של המשתמש
```

**דרך מורחבת (עם מידע מלא):**
```javascript
const request = await getRequestWithUser(requestId);
console.log(request.user); // אובייקט מלא של המשתמש
console.log(request.user.name); // שם המשתמש
console.log(request.user.declared_gender); // מגדר מוצהר
```

## מבנה הנתונים

### בקשת נסיעה (Ride Request)
```javascript
{
  id: "...",
  user_id: "...",  // <-- חדש: קישור למשתמש
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
  created_at: Date
}
```

### הצעת נסיעה (Ride Offer)
```javascript
{
  id: "...",
  user_id: "...",  // <-- חדש: קישור למשתמש
  driver_phone: "+972...",
  direction: "north|south",
  departure_time: Date,
  seats_male_only: Number,
  seats_female_only: Number,
  seats_anygender: Number,
  status: "active|full|cancelled",
  created_at: Date
}
```

### תוצאה מורחבת (עם מידע משתמש)
```javascript
{
  // כל השדות הרגילים של request/offer
  // ...
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

## תאימות לאחור

השינוי הוא **backwards compatible** - בקשות והצעות ישנות שאין להן `user_id` ימשיכו לעבוד כרגיל. המערכת תשתמש ב-`rider_phone` או `driver_phone` לאיתור המשתמש במקרה הצורך.

## יתרונות

1. **ביצועים משופרים**: אפשר לבצע שאילתות עם join במקום שאילתות נפרדות
2. **נתונים עקביים**: קישור ישיר למשתמש מבטיח עדכון אוטומטי בשינוי פרטי המשתמש
3. **גמישות**: אפשר בקלות להוסיף שדות נוספים למשתמש ולגשת אליהם דרך הבקשות וההצעות
4. **אנליטיקה**: קל יותר לעקוב אחר פעילות משתמשים לאורך זמן

## תאריך עדכון

אוקטובר 2025

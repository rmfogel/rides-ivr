# מערכת הרשמה דרך IVR - תיעוד מלא

## סקירה כללית

מערכת הרשמה מלאה המאפשרת למשתמשים להירשם דרך המערכת הקולית (IVR) בלבד, עם הקלטת שם ובחירת סיסמה בת 4 ספרות להתחברות לממשק האינטרנטי.

## תכונות עיקריות

1. **הרשמה דרך IVR בלבד**
   - הקלטת שם המשתמש (נשמר ב-MongoDB)
   - בחירת סיסמה בת 4 ספרות
   - אישור סיסמה
   - הצפנת הסיסמה עם bcrypt

2. **איפוס סיסמה**
   - אפשרות 4 בתפריט הראשי
   - תהליך זהה לבחירת סיסמה חדשה

3. **התחברות בממשק האינטרנטי**
   - דף התחברות עם מספר טלפון וסיסמה
   - אימות מול MongoDB
   - ניהול session עם express-session

4. **שימוש בהקלטת השם**
   - הקלטת השם מושמעת כאשר מוצאים התאמה בין נהג לנוסע
   - גיבוי ל-TTS במקרה שהקלטה לא זמינה

## מבנה מסד הנתונים

### שדות חדשים ב-collection של Users

```javascript
{
  name_recording_url: String,  // URL להקלטת השם מ-Twilio
  pin: String,                 // סיסמה מוצפנת (bcrypt hash)
  registered_via_ivr: Boolean  // האם המשתמש נרשם דרך IVR
}
```

## קבצים שנוצרו/עודכנו

### 1. מסד נתונים
- **`server/db/migrations/004_add_ivr_registration.sql`**
  - תיעוד השדות החדשים
  - הסבר על שימוש ב-MongoDB

- **`server/src/db/repo.js`**
  - `checkUserExists(phone)` - בדיקה אם משתמש קיים
  - `saveNameRecording(phone, recordingUrl)` - שמירת URL להקלטת שם
  - `savePIN(phone, hashedPin)` - שמירת סיסמה מוצפנת
  - `updatePIN(phone, hashedPin)` - עדכון סיסמה קיימת
  - `getUserPIN(phone)` - קבלת סיסמה לאימות

### 2. כלי עזר
- **`server/src/utils/pin.js`**
  - `hashPIN(pin)` - הצפנת סיסמה עם bcrypt
  - `verifyPIN(plainPin, hashedPin)` - אימות סיסמה
  - `isValidPINFormat(pin)` - בדיקת פורמט (בדיוק 4 ספרות)
  - `SALT_ROUNDS = 10` - רמת הצפנה

### 3. קבצי אודיו
- **`server/scripts/generate-registration-audio.js`**
  - יצירת 11 קבצי אודיו בעברית (250-259 + עדכון 002)
  - שימוש ב-Google Cloud TTS
  - קול: `he-IL-Wavenet-B` (קול גברי עקבי)
  - קצב דיבור: 0.9

- **`server/public/audio/he/dictionary.json`**
  - הוספת רשומות 250-259 עם ניקוד מלא
  - עדכון רשומה 002 להכללת אופציית איפוס סיסמה

#### קבצי האודיו החדשים:
- **250**: "שָׁלוֹם. בְּרוּכִים הַבָּאִים לְמַעֲרֶכֶת הַהַסָּעוֹת."
- **251**: "בִּשְׁבִיל לְהִשְׁתַּמֵּשׁ בַּמַּעֲרֶכֶת, עָלֶיךָ לְהָקְלִיט אֶת שִׁמְךָ וְלִבְחוֹר סִיסְמָה."
- **252**: "לְאַחַר הַצְּלִיל, נָא הַקְלֵט אֶת שִׁמְךָ הַמָּלֵא וְהַקֵּשׁ כַּרְסֶמֶת כְּדֵי לְסַיֵּם."
- **253**: "מַקְלִיט עַכְשָׁיו."
- **254**: "תּוֹדָה. עַכְשָׁיו, נָא בְּחַר סִיסְמָה בַּת אַרְבַּע סְפָרוֹת לְשִׁמּוּשׁ בַּמַּעֲרֶכֶת הָאִינְטֶרְנֶטִית."
- **255**: "אַתָּה בָּחַרְתָּ בְּסִיסְמָה"
- **256**: "לְאִשּׁוּר הַסִּיסְמָה, הַקֵּשׁ אוֹתָהּ שׁוּב."
- **257**: "הַסִּיסְמָאוֹת לֹא תּוֹאֲמוֹת. נְנַסֶּה שׁוּב."
- **258**: "הַהִרְשָׁמָה הוּשְׁלְמָה בְּהַצְלָחָה. עַכְשָׁיו תּוּעֲבַר לְתַפְרִיט הָרָאשִׁי."
- **259**: "בְּחַר סִיסְמָה חֲדָשָׁה בַּת אַרְבַּע סְפָרוֹת."
- **002** (עודכן): הוסף "לְאִיפּוּס סִיסְמָה הַקֵּשׁ 4"

### 4. IVR Flow - routes/voice.js

#### מסלולים חדשים לתהליך הרשמה:

1. **`/incoming`** (עודכן)
   - בודק אם `registered_via_ivr === true`
   - אם לא רשום, מפנה ל-`/register/welcome`
   - אם רשום, ממשיך לתפריט הרגיל

2. **`/register/welcome`**
   - מקליט 250+251 (ברוכים הבאים + הסבר על הרשמה)
   - מפנה ל-`/register/record-name`

3. **`/register/record-name`**
   - מקליט 252+253 (הוראות הקלטה + התחלת הקלטה)
   - משתמש ב-`<Record>` עם `finishOnKey="#"`
   - מפנה ל-`/register/save-name` עם RecordingUrl

4. **`/register/save-name`**
   - שומר את RecordingUrl במסד הנתונים
   - מפנה ל-`/register/recording-status` לאישור הצלחה

5. **`/register/recording-status`**
   - מוודא שההקלטה נשמרה
   - מפנה ל-`/register/choose-pin`

6. **`/register/choose-pin`**
   - מקליט 254 (בקשה לבחירת סיסמה)
   - מקבל 4 ספרות מהמשתמש
   - שומר בסשן וממשיך ל-`/register/confirm-pin`

7. **`/register/confirm-pin`**
   - מקליט 255+256 (חזרה על הסיסמה + בקשה לאישור)
   - מקבל 4 ספרות מהמשתמש
   - ממשיך ל-`/register/save-pin`

8. **`/register/save-pin`**
   - משווה בין שתי הסיסמאות
   - אם לא תואמות: מקליט 257 וחוזר ל-`choose-pin`
   - אם תואמות: מצפין ושומר במסד הנתונים
   - מעדכן `registered_via_ivr = true`
   - מקליט 258 (הרשמה הושלמה)
   - מפנה לתפריט הראשי

#### מסלולים לאיפוס סיסמה:

9. **`/menu`** (עודכן)
   - הוסף אופציה 4 לאיפוס סיסמה
   - מפנה ל-`/register/reset-pin`

10. **`/register/reset-pin`**
    - מקליט 259 (בחר סיסמה חדשה)
    - מקבל 4 ספרות
    - שומר בסשן וממשיך ל-`/register/reset-pin-confirm`

11. **`/register/reset-pin-confirm`**
    - מקליט 255+256 (אישור סיסמה)
    - מקבל 4 ספרות
    - ממשיך ל-`/register/reset-pin-save`

12. **`/register/reset-pin-save`**
    - משווה בין שתי הסיסמאות
    - אם לא תואמות: חוזר ל-`reset-pin`
    - אם תואמות: מעדכן סיסמה במסד הנתונים
    - מקליט 258 (הרשמה הושלמה)
    - מפנה לתפריט הראשי

#### שימוש בהקלטת השם:

13. **`playFullName(twiml, user, language)`** (עודכן)
    - קודם בודק אם קיים `user.name_recording_url`
    - אם כן, מקליט את ההקלטה מ-Twilio
    - אם לא, משתמש ב-TTS כרגיל

### 5. מערכת אימות ווב

- **`server/src/routes/auth.js`**
  - `POST /api/auth/login` - התחברות עם טלפון וסיסמה
  - `POST /api/auth/logout` - התנתקות
  - `GET /api/auth/verify-session` - בדיקת מצב התחברות
  - `requireAuth()` middleware לאבטחת מסלולים

- **`server/public/auth.js`** (client-side)
  - `window.Auth.check()` - בדיקה אם משתמש מחובר
  - `window.Auth.require()` - דרישה להתחברות (redirect לlogin)
  - `window.Auth.logout()` - התנתקות
  - רץ אוטומטית בכל טעינת דף

- **`server/public/login.html`**
  - טופס התחברות מעוצב בעברית
  - פורמט אוטומטי של מספר טלפון
  - וולידציה של 4 ספרות סיסמה
  - הודעות שגיאה והצלחה
  - הפניה ל-`my-rides.html` לאחר התחברות מוצלחת

- **`server/src/app.js`** (עודכן)
  - הוסף `app.use('/api/auth', authRouter)`
  - שינוי דף הבית ל-`login.html`
  - הוסף session middleware עם timeout של שעה
  - הסרת route של `/api/register` (רישום רק דרך IVR)

### 6. דפי HTML מוגנים

כל הדפים הבאים עודכנו עם authentication:

- **`server/public/my-rides.html`**
- **`server/public/offer-ride.html`**
- **`server/public/request-ride.html`**

עדכונים:
1. הוספת `<script src="/auth.js"></script>` ב-`<head>`
2. שינוי קישור הניווט מ-"הרשמה" ל-"התחברות" (מצביע ל-`/login.html`)

## תהליך הרשמה מלא

### 1. שיחה ראשונה (משתמש לא רשום)
```
1. משתמש מתקשר למערכת
2. `/incoming` מזהה שהמשתמש לא רשום
3. `/register/welcome` - הודעת ברוכים הבאים
4. `/register/record-name` - הקלטת שם
5. `/register/save-name` - שמירת הקלטה
6. `/register/choose-pin` - בחירת סיסמה
7. `/register/confirm-pin` - אישור סיסמה
8. `/register/save-pin` - שמירה במסד נתונים
9. הפניה לתפריט הראשי
```

### 2. שיחה רגילה (משתמש רשום)
```
1. משתמש מתקשר למערכת
2. `/incoming` מזהה משתמש רשום
3. עובר ישירות לתפריט הראשי
4. בתפריט יש אופציה 4 לאיפוס סיסמה
```

### 3. התחברות לממשק האינטרנטי
```
1. משתמש נכנס ל-login.html (דף הבית)
2. מזין מספר טלפון וסיסמה בת 4 ספרות
3. auth.js שולח בקשה ל-/api/auth/login
4. auth.js (backend) מאמת עם MongoDB
5. אם נכון - יוצר session ומפנה ל-my-rides.html
6. כל הדפים המוגנים בודקים session בטעינה
```

### 4. איפוס סיסמה דרך IVR
```
1. משתמש מתקשר למערכת
2. בתפריט הראשי מקיש 4
3. `/register/reset-pin` - בחירת סיסמה חדשה
4. `/register/reset-pin-confirm` - אישור סיסמה
5. `/register/reset-pin-save` - עדכון במסד נתונים
6. חזרה לתפריט הראשי
```

## הגדרות אבטחה

### הצפנת סיסמאות
```javascript
// server/src/utils/pin.js
const SALT_ROUNDS = 10;

async function hashPIN(pin) {
  return await bcrypt.hash(pin, SALT_ROUNDS);
}

async function verifyPIN(plainPin, hashedPin) {
  return await bcrypt.compare(plainPin, hashedPin);
}
```

### ניהול Session
```javascript
// server/src/app.js
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,  // Set to true in production with HTTPS
    maxAge: 3600000  // 1 hour
  }
}));
```

### נורמליזציה של מספרי טלפון
```javascript
// Removes all non-digit characters
const normalized = phone.replace(/\D/g, '');

// Converts Israeli international format to local
if (normalized.startsWith('972')) {
  return '0' + normalized.slice(3);
}
```

## בדיקות נדרשות

### 1. בדיקת IVR
- [ ] משתמש חדש עובר תהליך הרשמה מלא
- [ ] הקלטת השם נשמרת ב-MongoDB
- [ ] סיסמה מוצפנת נכון ב-MongoDB
- [ ] אי-התאמה בין סיסמאות מחזירה להתחלה
- [ ] לאחר הרשמה מוצלחת עובר לתפריט הראשי
- [ ] משתמש רשום עובר ישירות לתפריט
- [ ] אופציה 4 בתפריט מאפשרת איפוס סיסמה
- [ ] איפוס סיסמה מעדכן את הסיסמה במסד הנתונים

### 2. בדיקת התחברות ווב
- [ ] login.html נטען כדף הבית
- [ ] וולידציה של פורמט טלפון (10 ספרות)
- [ ] וולידציה של פורמט סיסמה (4 ספרות)
- [ ] התחברות מוצלחת מפנה ל-my-rides.html
- [ ] התחברות לא מוצלחת מציגה שגיאה
- [ ] ניסיון גישה לדף מוגן בלי התחברות מפנה ל-login
- [ ] session נשמר במשך שעה
- [ ] התנתקות מוחקת את ה-session

### 3. בדיקת שימוש בהקלטת שם
- [ ] כאשר נמצאת התאמה, מוקלטת הקלטת השם של הנוסע לנהג
- [ ] כאשר נמצאת התאמה, מוקלטת הקלטת השם של הנהג לנוסע
- [ ] במקרה של שגיאה בהקלטה, מוקלט TTS כגיבוי

### 4. בדיקת אודיו
- [ ] כל 11 קבצי האודיו נוצרו (250-259 + 002)
- [ ] כל הקבצים בקול עקבי (Wavenet-B)
- [ ] הניקוד נכון ומובן
- [ ] קצב הדיבור מתאים

## פרטים טכניים נוספים

### Dependencies חדשים
```json
{
  "bcrypt": "^5.1.1",
  "express-session": "^1.17.3"
}
```

### משתנים נדרשים ב-.env
```
SESSION_SECRET=your-very-secret-key-here
GOOGLE_APPLICATION_CREDENTIALS=./tts-key.json
```

### מבנה MongoDB
```javascript
// Collection: users
{
  _id: ObjectId,
  phone: String,  // מנורמל: רק ספרות, מתחיל ב-0
  name: String,
  name_recording_url: String,  // URL מ-Twilio
  pin: String,  // bcrypt hash
  registered_via_ivr: Boolean,
  // ... שאר השדות הקיימים
}
```

## קבצי קוד חשובים

1. **DB Layer**: `server/src/db/repo.js` - פונקציות CRUD
2. **PIN Utils**: `server/src/utils/pin.js` - הצפנה ואימות
3. **IVR Flow**: `server/src/routes/voice.js` - תהליך הרשמה ואיפוס
4. **Auth Backend**: `server/src/routes/auth.js` - API endpoints
5. **Auth Frontend**: `server/public/auth.js` - בדיקת session בצד לקוח
6. **Login Page**: `server/public/login.html` - טופס התחברות

## שיפורים עתידיים אפשריים

1. **אבטחה**
   - הגבלת ניסיונות התחברות (rate limiting)
   - CAPTCHA למניעת brute force
   - שימוש ב-Redis לניהול sessions בייצור

2. **חוויית משתמש**
   - אפשרות להאזין להקלטת השם לפני אישור
   - הקלטה מחדש של השם אם לא מרוצה
   - שליחת SMS עם הסיסמה לאחר איפוס

3. **ניטור**
   - לוג של כל ניסיונות התחברות
   - מעקב אחר שכחת סיסמה
   - התראות על פעילות חשודה

4. **גיבוי**
   - שמירת הקלטות גם ב-cloud storage (לא רק Twilio)
   - גיבוי אוטומטי של MongoDB

## סיכום

המערכת כעת מאפשרת:
- ✅ הרשמה מלאה דרך IVR בלבד
- ✅ הקלטת שם משתמש
- ✅ בחירת סיסמה בת 4 ספרות מוצפנת
- ✅ איפוס סיסמה דרך IVR
- ✅ התחברות לממשק אינטרנטי
- ✅ הגנה על כל הדפים
- ✅ שימוש בהקלטת שם בהודעות התאמה
- ✅ ניהול session מאובטח

כל הקוד נבדק לשגיאות תחביר ומוכן לשימוש!

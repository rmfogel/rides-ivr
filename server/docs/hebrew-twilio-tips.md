# טיפים לפתרון בעיות עם עברית ב-Twilio

Twilio נוטה להתקשות עם שפות שונות מאנגלית, במיוחד עם שפות RTL (מימין לשמאל) כמו עברית. הנה מספר דרכים לפתור בעיות נפוצות:

## 1. בעיות נפוצות והפתרונות שלהן

### 🔹 טקסט עברי לא נקרא כראוי
**פתרון:** השתמשו בקול `alice` במקום ב-Polly, הוא מתמודד טוב יותר עם עברית בסיסית.
```javascript
twiml.say({ voice: 'alice' }, "שלום");  // עובד טוב יותר מ-Polly לעתים
```

### 🔹 הודעות ארוכות נקטעות באמצע
**פתרון:** פצלו את הטקסט למשפטים קצרים והשתמשו בקריאות `.say()` נפרדות.
```javascript
// במקום:
twiml.say({ voice: 'alice' }, "משפט ארוך מאוד שנקטע באמצע...");

// השתמשו ב:
twiml.say({ voice: 'alice' }, "משפט ראשון.");
twiml.say({ voice: 'alice' }, "משפט שני.");
```

### 🔹 בעיות בהגייה של מספרים ואותיות
**פתרון:** הפרידו בין מספרים לטקסט והוסיפו רווחים בין ספרות.
```javascript
// במקום:
twiml.say({}, `מספר הטלפון הוא 0501234567`);

// השתמשו ב:
twiml.say({}, "מספר הטלפון הוא");
twiml.say({}, "0 5 0 1 2 3 4 5 6 7");
```

### 🔹 סימני פיסוק גורמים לבעיות
**פתרון:** הסירו סימני פיסוק מיותרים והחליפו אותם ברווחים.
```javascript
const text = hebrewText.replace(/[.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
```

## 2. אסטרטגיות לעבודה עם עברית

### 🔹 השתמשו בכמות מינימלית של טקסט
קצרו הודעות ככל האפשר ומקדו אותן במידע החיוני ביותר.

### 🔹 פשטו את השפה
השתמשו בשפה פשוטה יותר, ללא ביטויים מורכבים או מילות קישור מיותרות.

### 🔹 הסתמכו יותר על DTMF (מקשים)
בקשו מהמשתמש להקיש מקשים במקום לנסות לזהות דיבור.

### 🔹 שקלו להשתמש בקבצי הקלטה מוכנים מראש
לחלופין, הקליטו מראש הודעות בעברית והשתמשו ב-`<Play>` במקום ב-`<Say>`:
```javascript
twiml.play('https://example.com/recordings/welcome-he.mp3');
```

## 3. שיטות מתקדמות

### 🔹 שימוש ב-SSML (Speech Synthesis Markup Language)
ניתן לשלב SSML עם Polly כדי לשפר את ההגייה:
```javascript
twiml.say({ voice: 'Polly.Carmit', language: 'he-IL' },
  '<speak><prosody rate="slow">ברוכים הבאים</prosody></speak>');
```

### 🔹 שימוש במספרים ואותיות לטיניות
שילוב מספרים ואותיות לטיניות יכול לעזור:
```javascript
twiml.say({}, "להקיש מספר 1 לאפשרות A");
```

### 🔹 בדיקה שיטתית
בדקו כל הודעה בנפרד ותעדו אילו צירופים עובדים הכי טוב.

---

הקובץ `twilioHebrewMapper.js` ו-`hebrewHelper.js` מיישמים רבות מהטכניקות הללו באופן אוטומטי.
# עדכון שאלות מגדר לנהגים
**תאריך:** 19 אוקטובר 2025  
**מטרה:** הוספת שאלות פרטניות על מקומות גברים/נשים גם לנהגים, בדומה לזרימת הנוסעים

## רקע
במקור, זרימת הנהג שאלה רק על **סה"כ מקומות** ללא פירוט מגדרי. לעומת זאת, זרימת הנוסעים כבר כללה שאלות מפורטות:
- כמה נוסעים גברים?
- כמה נוסעות נשים?
- כמה זוגות?

המערכת תומכת ב-3 סוגי מושבים:
- `maleOnlySeats` - מקומות לגברים בלבד
- `femaleOnlySeats` - מקומות לנשים בלבד  
- `unisexSeats` - מקומות מעורבים

## מה שונה

### 1. הקלטות חדשות שנוצרו
**קבצים:** `server/public/audio/he/097.mp3`, `098.mp3`

| ID  | מפתח ב-PROMPT_IDS              | תוכן עברי                         |
|-----|--------------------------------|----------------------------------|
| 097 | `driver_male_seats_question`   | "כמה מקומות לגברים יש לך?"      |
| 098 | `driver_female_seats_question` | "כמה מקומות לנשים יש לך?"       |

**הקול:** Google Cloud TTS `he-IL-Wavenet-B` (קול גבר מקצועי)

**כלי יצירה:** `scripts/generate-driver-recordings.js`

### 2. עדכונים ב-`src/routes/voice.js`

#### `/voice/driver-seats` (שורה ~1111)
```javascript
// לפני:
playPrompt(gather, 'how_many_males');  // הקלטה לנוסעים

// אחרי:
playPrompt(gather, 'driver_male_seats_question');  // הקלטה ייעודית לנהגים
```

#### `/voice/driver-male-seats` (שורה ~1127)
```javascript
// לפני (בשגיאה):
playPrompt(gather, 'how_many_males');

// אחרי:
playPrompt(gather, 'driver_male_seats_question');
```

#### `/voice/driver-female-seats` (שורה ~1168)
```javascript
// לפני (בשגיאה):
playPrompt(gather, 'how_many_females');

// אחרי:
playPrompt(gather, 'driver_female_seats_question');
```

### 3. עדכון `src/utils/recordings.js`
הוספנו למפת `PROMPT_IDS`:
```javascript
// Driver-specific seat questions
driver_male_seats_question: '097',  // כמה מקומות לגברים יש לך?
driver_female_seats_question: '098', // כמה מקומות לנשים יש לך?
```

## זרימת נהג מעודכנת

```
1. התחלה: /driver-new
   ↓
2. בחירת כיוון: /driver-direction
   ↓ [1=FROM/2=TO]
3. בחירת תאריך: /driver-date → /driver-date-choice
   ↓ [1=היום/2=מחר/3=תאריך אחר]
4. שעת יציאה: /driver-time → /driver-departure-time
   ↓ [HHMM]
5. מקומות לגברים: /driver-seats → /driver-male-seats
   ↓ [0-9]
6. מקומות לנשים: /driver-female-seats
   ↓ [0-9]
7. מקומות מעורבים: /driver-unisex-seats
   ↓ [0-9]
8. אישור: /driver-confirm
   ↓ [1=אישור/2=התחלה מחדש]
9. שמירה ותיאום: /driver-submit
```

## הפרדה ברורה: נוסע vs נהג

| היבט              | נוסע (Rider)             | נהג (Driver)                    |
|-------------------|--------------------------|---------------------------------|
| **שאלת גברים**    | "כמה נוסעים גברים?"      | "כמה מקומות לגברים יש לך?"     |
| **שאלת נשים**     | "כמה נוסעות נשים?"       | "כמה מקומות לנשים יש לך?"      |
| **הקלטות**        | 041, 042                 | 097, 098                        |
| **נושא השאלה**    | ✈️ כמה אנשים צריכים להסיע | 🚗 כמה מקומות יש ברכב           |

## בדיקה והפעלה
```powershell
# בדיקה שההקלטות קיימות
dir server\public\audio\he\097.mp3, server\public\audio\he\098.mp3

# הרצת השרת
cd server
npm run dev
```

## בדיקות נדרשות
- [ ] התקשרות כנהג והכנסת מספר מקומות גברים (ספרה 0-9)
- [ ] התקשרות כנהג והכנסת מספר מקומות נשים (ספרה 0-9)
- [ ] ולידציה שסה"כ > 0 (חייב להיות לפחות מקום אחד)
- [ ] האזנה להקלטות 097, 098 - בדיקה שהן ברורות ומדויקות
- [ ] התאמה אוטומטית בין נהג לנוסע לפי המושבים המפורטים

## קבצים ששונו
1. `server/src/routes/voice.js` - 3 שינויים בהקראת הקלטות
2. `server/src/utils/recordings.js` - הוספת 2 מפתחות חדשים
3. `server/public/audio/he/097.mp3` - הקלטה חדשה
4. `server/public/audio/he/098.mp3` - הקלטה חדשה
5. `server/scripts/generate-driver-recordings.js` - סקריפט יצירת הקלטות

## סיכום
המערכת כעת מבקשת מהנהג **באופן מפורש** כמה מקומות יש לו לגברים ולנשים, במקום רק "כמה מקומות יש לך בסך הכל". זה מבטיח:

✅ **עקביות** - גם נהג וגם נוסע עוברים שאלות מפורטות  
✅ **בהירות** - השאלות משקxxxxאת המגדר של המקומות הפנויים ברכב  
✅ **התאמה טובה יותר** - אלגוריתם ההתאמה יכול למצוא שידוכים מדויקים יותר  
✅ **חוויית משתמש** - הבדלה ברורה בין תפקיד הנוסע לתפקיד הנהג

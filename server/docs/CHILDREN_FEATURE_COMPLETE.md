# תכונת מספר הילדים - סיכום יישום מלא ✅

## סקירה כללית
נוספה תמיכה מלאה לציון מספר ילדים המצטרפים לנסיעה. הילדים הם בנוסף לנוסעים הבוגרים ויכולים לתפוס כל סוג מקום (גברים בלבד, נשים בלבד, או anygender).

## 🎯 מה בוצע

### 1. ✅ עדכון ממשק הקול (Voice Interface)
**קובץ:** `src/routes/voice.js`

נוספו:
- Endpoint חדש `/rider-children-count` ששואל "כמה ילדים מצטרפים?"
- העברת פרמטר `children` בכל ה-redirects
- הצגת מספר הילדים במסך האישור (אם > 0)
- שמירת `children_count` בפונקציית `/rider-submit`

```javascript
// דוגמה מהקוד:
voiceRouter.post('/rider-children-count', (req, res) => {
  // ...
  const childrenCount = parseInt(Digits) || 0;
  playPrompt(gather, 'how_many_children');
  // ...
});
```

### 2. ✅ עדכון אלגוריתם ההתאמה (Matching Algorithm)
**קובץ:** `src/engine/matching.js`

שינויים:
- נוספה פונקציה `tryAllocChild()` - ילדים יכולים לתפוס כל סוג מקום
- עודכן `allocFromOffer()` לכלול הקצאת ילדים בשני המצבים:
  - **"together" mode:** לולאת for שמוודאת שכל הילדים מוקצים
  - **"not together" mode:** לולאת while שמקצה כמה שיותר ילדים
- עודכן `matchNewOffer()` להוסיף `children: r.children_count||0` לאובייקט need
- עודכן `matchNewRequest()`:
  - נוסף children ל-`remaining` 
  - עודכן `remainingTotal()` לכלול ילדים
  - נוסף children ללוג debug

```javascript
// סדר העדיפות להקצאת ילדים:
const tryAllocChild = () => {
  if (s.anygender > 0) { s.anygender--; res.allocated_children++; return true; }
  if (s.male_only > 0) { s.male_only--; res.allocated_children++; return true; }
  if (s.female_only > 0) { s.female_only--; res.allocated_children++; return true; }
  return false;
};
```

### 3. ✅ מסד נתונים (MongoDB)
**לא נדרש migration!** 
MongoDB הוא schema-less, כך ש-`children_count` יתווסף אוטומטית כשהנוסעים יזינו את המידע.

**קובץ:** `src/db/repo.js`
הפונקציה `addRequest()` כבר תומכת בכל השדות שמועברים אליה, כולל children_count.

### 4. ✅ קבצי אודיו
**מיקום:** `public/audio/he/`

נוצרו 3 קבצים חדשים באמצעות Google Cloud TTS:
- `048.mp3` - "כמה ילדים מצטרפים? 0 עד 9."
- `210.mp3` - "כולל"
- `211.mp3` - "ילדים"

**קובץ:** `public/audio/he/dictionary.json`
```json
{
  "048": "כמה ילדים מצטרפים? 0 עד 9.",
  "210": "כולל",
  "211": "ילדים"
}
```

**קובץ:** `src/utils/recordings.js`
```javascript
export const PROMPT_IDS = {
  // ...
  how_many_children: '048',
  including: '210',
  children: '211',
  // ...
};
```

## 📋 תרחיש שימוש - נוסע מזמין נסיעה

1. נוסע מתקשר למערכת
2. בוחר "נוסע" (2)
3. מזין כיוון, תאריך, שעות
4. מזין מספר גברים בוגרים
5. מזין מספר נשים בוגרות
6. **🆕 מזין מספר ילדים (0-9)**
7. מזין מספר זוגות ודרישת "ביחד"
8. מאשר ומגיש בקשה

## 🔄 לוגיקת ההקצאה

### עקרונות:
- ילדים נספרים **בנפרד** מהמבוגרים (male + female)
- סך הנוסעים = male + female + children
- ילדים **גמישים** - יכולים לתפוס כל סוג מקום

### סדר עדיפויות להקצאה:
1. **זוגות** - זוג יכול לתפוס: (male_only + female_only) או (2 × anygender)
2. **גברים** - גבר יכול לתפוס: male_only או anygender
3. **נשים** - אישה יכולה לתפוס: female_only או anygender
4. **ילדים** - ילד יכול לתפוס: anygender → male_only → female_only

### דוגמה:
```
בקשה: 1 גבר, 1 אישה, 2 ילדים
הצעה: 2 male_only, 1 female_only, 1 anygender

הקצאה:
- גבר 1 → male_only (נותר: 1 male_only)
- אישה 1 → female_only (נותר: 0 female_only)
- ילד 1 → anygender (נותר: 0 anygender)
- ילד 2 → male_only (נותר: 0 male_only)

✅ כל הנוסעים הוקצו!
```

## 🧪 בדיקות שיש לבצע

1. **IVR Flow:**
   - ☐ התקשר למערכת ובחר "נוסע"
   - ☐ ענה על כל השאלות כולל מספר ילדים
   - ☐ ודא שמסך האישור מציג את מספר הילדים
   - ☐ ודא שהבקשה נשמרת במסד הנתונים

2. **Matching Algorithm:**
   - ☐ צור בקשה עם ילדים
   - ☐ צור הצעה מתאימה
   - ☐ ודא שהמערכת יוצרת match
   - ☐ בדוק שהילדים מוקצים נכון

3. **Edge Cases:**
   - ☐ בקשה עם 0 ילדים (לא צריך להציג בסיכום)
   - ☐ בקשה עם רק ילדים (ללא מבוגרים) - אמור להיות חסום
   - ☐ הצעה עם מספיק מקומות למבוגרים אך לא לילדים

## 📂 קבצים שונו

```
✅ src/routes/voice.js             - נוסף endpoint ו-redirects
✅ src/engine/matching.js          - אלגוריתם התאמה מלא
✅ src/utils/recordings.js         - נוספו PROMPT_IDS
✅ public/audio/he/dictionary.json - נוספו 3 ערכים
✅ public/audio/he/048.mp3          - נוצר
✅ public/audio/he/210.mp3          - נוצר
✅ public/audio/he/211.mp3          - נוצר
✅ scripts/generate-children-audio.js - תסריט עזר (שימושי לעתיד)
```

## 🎉 סטטוס: הכל מוכן!

התכונה מיושמת במלואה וכל הקבצים נוצרו. המערכת מוכנה לבדיקות ולהפעלה בפרודקשן.

### הפעלת השרת:
```powershell
cd server
npm start
# או
.\run-local.bat
```

### בדיקה מהירה:
1. התקשר למספר Twilio של המערכת
2. בחר "נוסע" (2)
3. עבור את כל השלבים
4. ודא שהשאלה "כמה ילדים מצטרפים?" מושמעת
5. ודא שהילדים מופיעים באישור

---

**תאריך יישום:** 28 אוקטובר 2025  
**גרסה:** 1.0  
**מיושם על ידי:** GitHub Copilot

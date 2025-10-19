# 📚 תיעוד מערכת IVR

תיקייה זו מכילה את כל המסמכים והמדריכים למערכת ה-IVR.

---

## 📑 מסמכים עיקריים

### 🎯 התחלה מהירה
- **[CHANGES-QUICK.md](./CHANGES-QUICK.md)** - סיכום מהיר של השינויים האחרונים
- **[UPDATE-SUMMARY.md](./UPDATE-SUMMARY.md)** - סיכום מפורט של עדכון חוויית המשתמש

### 🔧 טכני
- **[FLOW-IMPROVEMENTS-SUMMARY.md](./FLOW-IMPROVEMENTS-SUMMARY.md)** - פירוט טכני של שיפורי הזרימות
- **[NEW-RECORDINGS-NEEDED.md](./NEW-RECORDINGS-NEEDED.md)** - רשימת הקלטות חדשות נדרשות

### 🎙️ הקלטות
- **[RECORDING-SCRIPTS-HE.md](./RECORDING-SCRIPTS-HE.md)** - טקסטים מדויקים בעברית להקלטות
- **[AUDIO-SYSTEM-SUMMARY-HE.md](./AUDIO-SYSTEM-SUMMARY-HE.md)** - סיכום מערכת השמע
- **[audio-generation-guide.md](./audio-generation-guide.md)** - מדריך יצירת הקלטות
- **[recordings-audit.md](./recordings-audit.md)** - ביקורת הקלטות קיימות

### 🌐 תמיכה בעברית
- **[hebrew-support.md](./hebrew-support.md)** - תמיכה בעברית במערכת
- **[hebrew-twilio-tips.md](./hebrew-twilio-tips.md)** - טיפים לעבודה עם Twilio בעברית

### ✅ בדיקות
- **[TESTING-CHECKLIST.md](./TESTING-CHECKLIST.md)** - רשימת בדיקה מקיפה

---

## 🗂️ לפי נושא

### אני רוצה להבין מה השתנה
1. קראו **CHANGES-QUICK.md** לסיכום מהיר
2. קראו **UPDATE-SUMMARY.md** לפרטים מלאים
3. קראו **FLOW-IMPROVEMENTS-SUMMARY.md** לפרטים טכניים

### אני צריך ליצור הקלטות
1. קראו **NEW-RECORDINGS-NEEDED.md** - מה נדרש
2. קראו **RECORDING-SCRIPTS-HE.md** - הטקסטים המדויקים
3. הריצו `node scripts/generate-new-error-recordings.js` (אוטומטי)
   או הקליטו ידנית לפי ההנחיות

### אני רוצה לבדוק את המערכת
1. קראו **TESTING-CHECKLIST.md**
2. עברו על כל הבדיקות
3. סמנו ✅ את מה שעבר

### אני עובד עם השמע
1. **audio-generation-guide.md** - איך ליצור הקלטות
2. **AUDIO-SYSTEM-SUMMARY-HE.md** - איך המערכת עובדת
3. **recordings-audit.md** - רשימת כל ההקלטות

### אני עובד עם עברית
1. **hebrew-support.md** - תמיכה כללית
2. **hebrew-twilio-tips.md** - טיפים ספציפיים ל-Twilio
3. **RECORDING-SCRIPTS-HE.md** - טקסטים בעברית

---

## 🎯 זרימת עבודה מומלצת

### עבור מפתח חדש:
1. ✅ **UPDATE-SUMMARY.md** - הבינו את המערכת
2. ✅ **FLOW-IMPROVEMENTS-SUMMARY.md** - הבינו את הקוד
3. ✅ **TESTING-CHECKLIST.md** - בדקו שהכל עובד

### עבור יצירת הקלטות:
1. ✅ **NEW-RECORDINGS-NEEDED.md** - מה נדרש
2. ✅ **RECORDING-SCRIPTS-HE.md** - קבלו את הטקסטים
3. ✅ **audio-generation-guide.md** - למדו איך ליצור
4. ✅ הריצו את הסקריפט או הקליטו ידנית

### עבור QA:
1. ✅ **TESTING-CHECKLIST.md** - הבדיקות
2. ✅ **FLOW-IMPROVEMENTS-SUMMARY.md** - מה לבדוק
3. ✅ דווחו על בעיות

---

## 📊 מבנה המסמכים

```
docs/
├── README.md (המסמך הזה)
│
├── 🚀 התחלה מהירה
│   ├── CHANGES-QUICK.md
│   └── UPDATE-SUMMARY.md
│
├── 🔧 טכני
│   ├── FLOW-IMPROVEMENTS-SUMMARY.md
│   └── NEW-RECORDINGS-NEEDED.md
│
├── 🎙️ הקלטות
│   ├── RECORDING-SCRIPTS-HE.md
│   ├── AUDIO-SYSTEM-SUMMARY-HE.md
│   ├── audio-generation-guide.md
│   └── recordings-audit.md
│
├── 🌐 עברית
│   ├── hebrew-support.md
│   └── hebrew-twilio-tips.md
│
└── ✅ בדיקות
    └── TESTING-CHECKLIST.md
```

---

## 🔄 עדכונים אחרונים

### 19 אוקטובר 2025
- ✨ שיפור זרימות בקשת והצעת נסיעה
- ✨ 7 הקלטות חדשות לטיפול בשגיאות
- ✨ מסמכים מפורטים להדרכה
- ✨ סקריפט אוטומטי ליצירת הקלטות
- ✨ רשימת בדיקה מקיפה

---

## 💡 טיפים

- 📖 **תמיד התחילו עם CHANGES-QUICK.md** אם אתם חדשים
- 🎯 **השתמשו ב-TESTING-CHECKLIST.md** לפני כל release
- 🎙️ **התייעצו ב-RECORDING-SCRIPTS-HE.md** לפני הקלטה
- 🔍 **חפשו במסמכים** - יש הרבה מידע שימושי

---

## 🤝 תרומה

אם אתם מוסיפים מסמך חדש:
1. הוסיפו אותו לרשימה למעלה
2. עדכנו את ה-README הזה
3. ודאו שהוא ברור ומפורט
4. הוסיפו דוגמאות אם רלוונטי

---

## 📞 עזרה

לא מצאתם משהו? יש שאלה?
- בדקו את כל המסמכים בתיקייה
- קראו את README הראשי של הפרויקט
- פתחו issue ב-GitHub

---

**בהצלחה עם המערכת! 🚀**

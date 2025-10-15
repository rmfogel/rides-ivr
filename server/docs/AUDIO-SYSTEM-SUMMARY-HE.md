# 🎙️ מערכת יצירת קבצי שמע - סיכום מקיף

## מה נוצר?

### 1. סקריפט יצירת השמע (`scripts/generate-audio.js`)
**תכונות מרכזיות:**
- ✅ חיבור ל-Google Cloud Text-to-Speech API
- ✅ קריאת dictionary.json ויצירת 84 קבצי MP3
- ✅ תמיכה במספר קולות עבריים (WaveNet איכות גבוהה)
- ✅ דילוג על קבצים קיימים (אופציה ל-regenerate)
- ✅ בדיקת חיבור ורשימת קולות זמינים
- ✅ דוח מפורט עם סטטיסטיקות
- ✅ טיפול בשגיאות והודעות ברורות

**פקודות זמינות:**
```bash
npm run audio:generate      # יצירת כל הקבצים החסרים
npm run audio:regenerate    # יצירה מחדש של כל הקבצים
npm run audio:test          # בדיקת חיבור ל-Google Cloud
npm run audio:voices        # רשימת כל הקולות הזמינים
```

**אופציות מתקדמות:**
```bash
node scripts/generate-audio.js --voice=he-IL-Wavenet-A    # בחירת קול ספציפי
node scripts/generate-audio.js --help                      # עזרה מלאה
```

### 2. מדריך מקיף (`docs/audio-generation-guide.md`)
**תוכן המדריך:**
- 📖 הוראות התקנה שלב אחר שלב
- 🔧 הגדרת Google Cloud Console
- 🎤 רשימה מלאה של קולות זמינים בעברית
- 💰 הערכת עלויות (כ-$0.04 ליצירה חד-פעמית!)
- 🔐 הנחיות אבטחה למפתחות
- 🐛 פתרון בעיות נפוצות
- ⚙️ התאמת הגדרות קול (מהירות, גובה צליל, ועוד)

### 3. מדריך התחלה מהירה (`AUDIO-QUICKSTART.md`)
**6 צעדים פשוטים:**
1. התקנת החבילה
2. השגת credentials מ-Google Cloud
3. הגדרת משתנה סביבה
4. בדיקת חיבור
5. יצירת כל הקבצים
6. אימות

### 4. הגנה על Credentials (`.gitignore`)
**נוסף הגנה על:**
- `*-key.json`
- `tts-key.json`
- `credentials.json`
- `service-account*.json`
- `gcloud-*.json`

### 5. סקריפטים חדשים ב-`package.json`
```json
{
  "audio:generate": "יצירת קבצי שמע חדשים",
  "audio:regenerate": "יצירה מחדש של כל הקבצים",
  "audio:test": "בדיקת חיבור",
  "audio:voices": "רשימת קולות זמינים"
}
```

## איך משתמשים?

### הכנה ראשונית (פעם אחת)

1. **התקנת החבילה:**
   ```bash
   cd server
   npm install @google-cloud/text-to-speech
   ```

2. **הגדרת Google Cloud:**
   - כנסי ל-https://console.cloud.google.com/
   - צרי פרויקט חדש או בחרי קיים
   - הפעילי "Cloud Text-to-Speech API"
   - צרי Service Account עם תפקיד "Cloud Text-to-Speech API User"
   - הורידי JSON key ושמרי בשם `tts-key.json` בתיקיית `server/`

3. **הגדרת משתנה סביבה:**
   ```powershell
   cd server
   $env:GOOGLE_APPLICATION_CREDENTIALS="$PWD\tts-key.json"
   ```

### בדיקה

```bash
npm run audio:test
```

צפוי לראות:
```
✅ Connection successful!
   Voice: he-IL-Wavenet-B
   Audio encoding: MP3
```

### יצירת כל הקבצים

```bash
npm run audio:generate
```

התוצאה:
```
🎙️  Starting audio generation...

Voice: he-IL-Wavenet-B (MALE)
Processing 84 prompts...

✅ Generated 001.mp3 (12.34 KB)
✅ Generated 002.mp3 (15.67 KB)
...
✅ Generated 3011.mp3 (8.21 KB)

============================================================
📊 GENERATION SUMMARY
============================================================
Total prompts:     84
✅ Generated:      84
⏭️  Skipped:        0
❌ Failed:         0
📦 Total size:     1.23 MB
============================================================

✅ Audio generation completed successfully!
```

## קולות עבריים זמינים

| שם הקול | מגדר | תיאור | מומלץ ל |
|---------|------|--------|---------|
| `he-IL-Wavenet-A` | נקבה | קול חם וידידותי | שירות לקוחות, קבלת פנים |
| `he-IL-Wavenet-B` | זכר | ברור ומקצועי (ברירת מחדל) | הנחיות, IVR |
| `he-IL-Wavenet-C` | זכר | קול עמוק יותר | הודעות רשמיות |
| `he-IL-Wavenet-D` | נקבה | גובה צליל גבוה | הודעות ידידותיות |

**לבחירת קול:**
```bash
node scripts/generate-audio.js --voice=he-IL-Wavenet-A
```

## מבנה הקבצים שייווצר

```
server/
  public/
    audio/
      he/
        001.mp3  ← "ברוכים הבאים לשירות הנסיעות"
        002.mp3  ← "לתפריט: לנהג הקש 1..."
        003.mp3  ← "לא התקבל קלט. להתראות"
        ...
        3000.mp3 ← "0"
        3001.mp3 ← "1"
        ...
        3011.mp3 ← ":"
        dictionary.json  ← מיפוי ID לטקסט
```

**סה"כ:** 84 קבצי MP3, כ-1.2 MB

## התאמות אישיות

ניתן לשנות בקובץ `scripts/generate-audio.js`:

```javascript
const CONFIG = {
  voice: {
    languageCode: 'he-IL',
    name: 'he-IL-Wavenet-B',
    ssmlGender: 'MALE'
  },
  audioConfig: {
    audioEncoding: 'MP3',
    speakingRate: 0.95,    // 0.25-4.0 (איטי לmhיר)
    pitch: 0,              // -20 עד 20 (נמוך לגבוה)
    volumeGainDb: 0,       // -96 עד 16 (שקט לrוצם)
    sampleRateHertz: 24000 // איכות שמע
  }
};
```

**דוגמאות:**
- קול איטי יותר: `speakingRate: 0.85`
- קול נשי גבוה: `pitch: 5`
- עוצמה חזקה: `volumeGainDb: 3`

## עלויות

**Google Cloud Text-to-Speech:**
- WaveNet voices: $16 לכל מיליון תווים
- Standard voices: $4 לכל מיליון תווים

**לפרויקט הזה:**
- 84 הקלטות × ~30 תווים ממוצע = ~2,520 תווים
- **עלות:** ~$0.04 (פחות מ-20 אגורות!)

💡 יצירה חד-פעמית - העלות מזערית!

## אבטחה

⚠️ **חשוב מאוד:**

1. ✅ **אף פעם לא** לשמור את `tts-key.json` ב-Git
2. ✅ הקובץ כבר מוגן ב-`.gitignore`
3. ✅ השתמשי בהרשאות מינימליות (רק Text-to-Speech API User)
4. ✅ שמרי את המפתח במקום מאובטח
5. ✅ במידת הצורך, החליפי מפתחות מעת לעת

## פתרון בעיות נפוצות

### שגיאה: "Cannot find module"
```bash
npm install @google-cloud/text-to-speech
```

### שגיאה: "PERMISSION_DENIED"
- ודאי שהService Account יש את התפקיד "Cloud Text-to-Speech API User"
- בדקי ב-Google Cloud Console > IAM

### שגיאה: "API_KEY_INVALID"
```powershell
# ודאי שהנתיב מלא ונכון
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\full\path\to\server\tts-key.json"
```

### הקבצים נשמעים מוזר
- נסי קול אחר:
  ```bash
  npm run audio:voices  # ראי רשימה
  node scripts/generate-audio.js --voice=he-IL-Wavenet-A --regenerate
  ```

### רוצה ליצור מחדש הכל
```bash
npm run audio:regenerate
```

## מה הלאה?

לאחר יצירת הקבצים:

1. ✅ האזיני לכמה קבצים ווודאי שהם נשמעים טוב
2. ✅ בדקי שכל 84 הקבצים נוצרו
3. ✅ הריצי את השרת עם ngrok ובדקי עם Twilio
4. ✅ בצעי שיחת בדיקה
5. ✅ במידת הצורך, שני הגדרות ו-regenerate
6. ✅ העלי את כל הקבצים לשרת ייצור
7. ✅ הגדירי `PUBLIC_BASE_URL` בייצור

## קבצים שנוצרו

```
✅ server/scripts/generate-audio.js         - סקריפט ייצור השמע
✅ server/docs/audio-generation-guide.md    - מדריך מקיף
✅ server/AUDIO-QUICKSTART.md               - התחלה מהירה
✅ .gitignore                                - הגנה על credentials
✅ server/package.json                       - npm scripts חדשים
```

## פקודות מועילות

```bash
# התקנה
npm install @google-cloud/text-to-speech

# בדיקת חיבור
npm run audio:test

# רשימת קולות
npm run audio:voices

# יצירת כל הקבצים
npm run audio:generate

# יצירה מחדש
npm run audio:regenerate

# קול ספציפי
node scripts/generate-audio.js --voice=he-IL-Wavenet-A

# עזרה
node scripts/generate-audio.js --help
```

## תמיכה ומשאבים

- 📚 [Google Cloud TTS Docs](https://cloud.google.com/text-to-speech/docs)
- 💰 [מחשבון מחירים](https://cloud.google.com/products/calculator)
- 🎤 [מדריך בחירת קולות](https://cloud.google.com/text-to-speech/docs/voices)
- 🔧 [SSML למתקדמים](https://cloud.google.com/text-to-speech/docs/ssml)

---

**הערה:** הסקריפט מוכן לשימוש מיידי לאחר הגדרת Google Cloud credentials!

**זמן יצירה משוער:** 2-3 דקות לכל 84 הקבצים 🚀

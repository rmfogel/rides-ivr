# הקלטות שנדרשות ליצירה/עדכון

## הקלטות שצריך לעדכן:

### 002.mp3 - main_menu (עדכון חשוב!)
**טקסט עברי:** לנהג הקש 1. לנוסע הקש 2. לעדכון נסיעות שנשמרו הקש 3.
**מיקום:** `server/public/audio/he/002.mp3`
**הערה:** זו הודעת התפריט הראשי - צריך להחליף את הקובץ הקיים!

---

## הקלטות חדשות שצריך ליצור:

### 130.mp3 - manage_menu
**טקסט עברי:** למחיקת נסיעות הקש 1.
**מיקום:** `server/public/audio/he/130.mp3`

### 131.mp3 - no_active_rides
**טקסט עברי:** אין לך נסיעות פעילות.
**מיקום:** `server/public/audio/he/131.mp3`

### 132.mp3 - choose_driver_or_rider_rides
**טקסט עברי:** לניהול נסיעות כנהג הקש 1. לניהול נסיעות כנוסע הקש 2.
**מיקום:** `server/public/audio/he/132.mp3`

### 133.mp3 - ride_details_intro
**טקסט עברי:** פרטי הנסיעה:
**מיקום:** `server/public/audio/he/133.mp3`

### 134.mp3 - press_1_delete_2_next_9_exit
**טקסט עברי:** למחיקת הנסיעה הקש 1. לנסיעה הבאה הקש 2. לחזרה הקש 9.
**מיקום:** `server/public/audio/he/134.mp3`

### 135.mp3 - confirm_delete_ride
**טקסט עברי:** האם אתה בטוח שברצונך למחוק את הנסיעה? הקש 1 לאישור או 2 לביטול.
**מיקום:** `server/public/audio/he/135.mp3`

### 136.mp3 - ride_deleted_successfully
**טקסט עברי:** הנסיעה נמחקה בהצלחה.
**מיקום:** `server/public/audio/he/136.mp3`

---

## דרכים ליצירת ההקלטות:

### אפשרות 1: AWS Polly (דורש הגדרת credentials)
```powershell
# הגדר את המשתנים:
$env:AWS_REGION = "us-east-1"
$env:AWS_ACCESS_KEY_ID = "your-key-id"
$env:AWS_SECRET_ACCESS_KEY = "your-secret-key"

# הרץ את הסקריפט:
cd c:\Users\Tog\Desktop\Rides\server
node scripts/tts-generate.js --lang he
```

### אפשרות 2: Google Cloud Text-to-Speech
השתמש בממשק של Google Cloud או בכלי CLI שלהם עם קול עברי

### אפשרות 3: כלים אונליין
- https://ttsmaker.com/ (תמיכה בעברית)
- https://www.narakeet.com/ (תמיכה בעברית)
- https://www.naturalreaders.com/ (תמיכה בעברית)

### אפשרות 4: הקלטה ידנית
הקלט את ההודעות בעצמך או באמצעות דובר/ת עברית

---

## סיכום השינויים שבוצעו בקוד:

✅ עודכן התפריט הראשי ב-`tts-generate.js`
✅ עודכנו תרגומים ב-`hebrewTranslations.js`
✅ נוסף תפריט ניהול חדש ב-`manage.js` עם אפשרות מחיקת נסיעות
✅ נוספו קודי הקלטות חדשים ב-`recordings.js`
✅ נוספו טקסטים להקלטות ב-`tts-generate.js`

🔴 נותר רק ליצור/לעדכן את קבצי השמע בפועל!

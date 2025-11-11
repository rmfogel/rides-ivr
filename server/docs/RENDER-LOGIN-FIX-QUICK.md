# תיקון מהיר - בעיית Login ב-Render

## הבעיה
כאשר האתר רץ ב-Render, לאחר התחברות מוצלחת המערכת קופצת בחזרה ללוגין.

## הסיבה
הגדרות session cookies לא מותאמות לסביבת ענן (Render).

## התיקון

### 1. app.js - הגדרות Session
```javascript
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'rides-ivr-secret',
  resave: false,
  saveUninitialized: false,
  name: 'rides.sid',
  cookie: { 
    secure: isProduction,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  },
  proxy: isProduction // CRITICAL for Render!
}));
```

### 2. login.html - הוספת credentials
```javascript
const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin', // הוסף שורה זו!
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
});
```

### 3. login.html - redirect נכון
```javascript
// בדוק returnTo ב-sessionStorage
const returnTo = sessionStorage.getItem('returnTo');
sessionStorage.removeItem('returnTo');
const redirectUrl = returnTo || '/my-rides.html';
window.location.href = redirectUrl;
```

## תוצאה
✅ Session נשמר ב-Render  
✅ משתמש נשאר מחובר  
✅ Redirect לדף המקורי  
✅ Session ל-24 שעות  

## הגדרות Render
```bash
NODE_ENV=production
SESSION_SECRET=your-secret-here
```

## קבצים ששונו
- `server/src/app.js`
- `server/public/login.html`

תיעוד מלא: `RENDER-LOGIN-FIX.md`

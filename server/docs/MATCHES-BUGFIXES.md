# תיקון באגים במודל ההקצאות

## תיאור הבעיות שתוקנו

### 🐛 בעיה 1: תאריכים ושעות מוצגים כ-undefined במודל

**תיאור**: כאשר פותחים את המודל "מי נוסע איתי?" או "איך אני נוסע?", השדות של תאריך ושעה היו מוצגים כ-`undefined`.

**סיבה**: 
- השרת מחזיר אובייקטים מה-MongoDB עם שדות כמו `departure_time` (Date object) ו-`earliest_time` (Date object)
- ה-endpoints של matches לא פירמטו את השדות האלה לפני החזרה ללקוח
- הלקוח ניסה להציג `matchData.date`, `matchData.departureTime` וכו' שלא היו מוגדרים

**פתרון**:
עדכון שני ה-endpoints `/api/rides/offer/:id/matches` ו-`/api/rides/request/:id/matches` לפרמט את התאריכים והשעות לפני החזרה.

---

### 🐛 בעיה 2: אין סימון ויזואלי ל-matches שעבר זמנם

**תיאור**: במודל ההקצאות, לא היה ניתן לזהות בקלות אילו הקצאות כבר עברו (תאריך+שעה בעבר).

**פתרון**:
- הוספת CSS class חדש: `.past-match` שמעמעם את הכרטיס (opacity 0.6) ומשנה צבע רקע לאפור
- הוספת לוגיקה בפונקציה `displayMatchesModal()` לבדוק אם ה-match עבר זמנו
- שיפור פונקציות `isPastRide()` ו-`isPastRequest()` לתמוך בפורמט `dd/MM/yyyy`

---

## שינויים בקבצים

### 1. `server/src/routes/offer-ride.js`

**שורות 695-736**: עדכון endpoint `GET /:id/matches`

#### לפני:
```javascript
const populatedMatches = await Promise.all(
  matchDocs.map(async (match) => {
    const request = await getRequestById(match.request_id.toString());
    return {
      // ...
      request: request ? {
        date: request.date,  // ❌ לא מוגדר
        earliestTime: request.earliestTime,  // ❌ לא מוגדר
        latestTime: request.latestTime,  // ❌ לא מוגדר
        // ...
      } : null
    };
  })
);
```

#### אחרי:
```javascript
const populatedMatches = await Promise.all(
  matchDocs.map(async (match) => {
    const request = await getRequestById(match.request_id.toString());
    
    if (!request) {
      return null;  // ✅ טיפול במקרה שהבקשה נמחקה
    }
    
    // ✅ פרמוט תאריכים ושעות
    const earliestDateTime = DateTime.fromJSDate(request.earliest_time).setZone(TZ);
    const latestDateTime = DateTime.fromJSDate(request.latest_time).setZone(TZ);
    const preferredDateTime = request.preferred_time ? 
      DateTime.fromJSDate(request.preferred_time).setZone(TZ) : null;
    
    return {
      // ...
      request: {
        date: earliestDateTime.toFormat('dd/MM/yyyy'),  // ✅ מפורמט
        earliestTime: earliestDateTime.toFormat('HH:mm'),  // ✅ מפורמט
        latestTime: latestDateTime.toFormat('HH:mm'),  // ✅ מפורמט
        preferredTime: preferredDateTime ? preferredDateTime.toFormat('HH:mm') : null,
        // ...
      }
    };
  })
);

// ✅ סינון nulls
const validMatches = populatedMatches.filter(m => m !== null);
```

---

### 2. `server/src/routes/request-ride.js`

**שורות 885-925**: עדכון endpoint `GET /:id/matches`

#### לפני:
```javascript
const populatedMatches = await Promise.all(
  matchDocs.map(async (match) => {
    const offer = await getOfferById(match.offer_id.toString());
    return {
      // ...
      offer: offer ? {
        date: offer.date,  // ❌ לא מוגדר
        departureTime: offer.departureTime,  // ❌ לא מוגדר
        // ...
      } : null
    };
  })
);
```

#### אחרי:
```javascript
const populatedMatches = await Promise.all(
  matchDocs.map(async (match) => {
    const offer = await getOfferById(match.offer_id.toString());
    
    if (!offer) {
      return null;  // ✅ טיפול במקרה שההצעה נמחקה
    }
    
    // ✅ פרמוט תאריך ושעה
    const departureDateTime = DateTime.fromJSDate(offer.departure_time).setZone(TZ);
    
    return {
      // ...
      offer: {
        date: departureDateTime.toFormat('dd/MM/yyyy'),  // ✅ מפורמט
        departureTime: departureDateTime.toFormat('HH:mm'),  // ✅ מפורמט
        // ...
      }
    };
  })
);

// ✅ סינון nulls
const validMatches = populatedMatches.filter(m => m !== null);
```

---

### 3. `server/public/my-rides.html`

#### א. הוספת CSS לסימון matches ישנים (שורות 333-345)

```css
.match-item.past-match {
    opacity: 0.6;
    background-color: #fafafa;
}

.match-item.past-match .match-name {
    color: #757575;
}
```

#### ב. שיפור פונקציות בדיקת תאריך (שורות 530-566)

**לפני**:
```javascript
function isPastRide(date, time) {
    try {
        const rideDateTime = new Date(`${date}T${time}:00+03:00`);
        // ❌ לא עובד עם dd/MM/yyyy
        return rideDateTime < now;
    } catch (error) {
        return false;
    }
}
```

**אחרי**:
```javascript
function isPastRide(date, time) {
    try {
        // ✅ המרת dd/MM/yyyy ל-yyyy-MM-dd
        let dateStr = date;
        if (date.includes('/')) {
            const [day, month, year] = date.split('/');
            dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        const rideDateTime = new Date(`${dateStr}T${time}:00+03:00`);
        const now = new Date();
        return rideDateTime < now;
    } catch (error) {
        console.error('Error checking past ride:', error, { date, time });
        return false;
    }
}
```

#### ג. הוספת בדיקה ב-displayMatchesModal (שורות 880-900)

```javascript
// ✅ בדיקה אם match עבר זמנו
let isPast = false;
if (type === 'offer') {
    // For offers, check the request's latest time
    isPast = isPastRequest(matchData.date, matchData.latestTime);
} else {
    // For requests, check the offer's departure time
    isPast = isPastRide(matchData.date, matchData.departureTime);
}

const matchItemClass = isPast ? 'match-item past-match' : 'match-item';

// ✅ שימוש ב-class הדינמי
return `
    <div class="${matchItemClass}">
        <!-- ... -->
    </div>
`;
```

---

## תוצאות

### ✅ לפני התיקון:
```
טלפון: 0501234567
כיוון: מהיישוב
תאריך: undefined       ❌
שעות: undefined - undefined   ❌
```

### ✅ אחרי התיקון:
```
טלפון: 0501234567
כיוון: מהיישוב
תאריך: 05/11/2025     ✅
שעות: 08:00 - 09:00    ✅
```

### ✅ סימון ויזואלי:
- **הקצאות עתידיות**: רקע לבן, טקסט שחור, opacity רגיל
- **הקצאות שעברו**: רקע אפור בהיר, טקסט אפור, מעומעם (opacity 0.6)

---

## בדיקות שבוצעו

1. ✅ תאריכים ושעות מוצגים נכון במודל
2. ✅ matches שעבר זמנם מסומנים באפור ומעומעמים
3. ✅ פרסינג נכון של פורמט dd/MM/yyyy
4. ✅ טיפול ב-nulls (הצעות/בקשות שנמחקו)
5. ✅ אין שגיאות syntax
6. ✅ לוגיקה עובדת עבור offers ו-requests

---

## תאריך תיקון
4 בנובמבר 2025

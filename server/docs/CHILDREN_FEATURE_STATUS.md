# תכונת ילדים - סטטוס יישום

## ✅ הושלם

### 1. מסד נתונים
- ✅ נוצר migration: `db/migrations/002_add_children_count.sql`
- ✅ מוסיף עמודה `children_count INTEGER DEFAULT 0` ל-`ride_requests`

### 2. ממשק קולי (voice.js)
- ✅ נוסף endpoint `/rider-children-count` - שואל "כמה ילדים מצטרפים?"
- ✅ עודכן `/rider-female-count` להפנות ל-`/rider-children-count`
- ✅ עודכן `/rider-children-count` להפנות ל-`/rider-couples-count`
- ✅ עודכן `/rider-couples-count` לקבל ולהעביר `children` parameter
- ✅ עודכן `/rider-together` לקבל ולהעביר `children` parameter
- ✅ עודכן `/rider-confirm` לקבל ולהציג `children` parameter
- ✅ עודכן `/rider-submit` לשמור `children_count` במסד הנתונים

### 3. Repository (repo.js)
- ✅ `addRequest()` עובד אוטומטית - MongoDB מקבל כל שדה

## ⚠️ נדרש השלמה ידנית

### 1. אלגוריתם התאמה (src/engine/matching.js)

צריך לעדכן את הפונקציה `allocFromOffer` כדי לתמוך בילדים:

#### שינויים נדרשים:

1. **הוסף פונקציה חדשה `tryAllocChild`** (אחרי `tryAllocFemale`):
```javascript
const tryAllocChild = () => {
  // Children can take any seat type - try in order of preference
  if (s.anygender > 0) { s.anygender--; res.allocated_children++; return true; }
  if (s.male_only > 0) { s.male_only--; res.allocated_children++; return true; }
  if (s.female_only > 0) { s.female_only--; res.allocated_children++; return true; }
  return false;
};
```

2. **עדכן את res** (שורה 8):
```javascript
const res = { allocated_couples: 0, allocated_male: 0, allocated_female: 0, allocated_anygender: 0, allocated_children: 0 };
```

3. **עדכן תגובה** (שורה 6):
```javascript
// seats: { male_only, female_only, anygender }  // need: { couples, males, females, children }
```

4. **הוסף קריאה ל-tryAllocChild בתנאי "together"** (אחרי שורה 43):
```javascript
for (let i=0;i<(n.children||0) && ok;i++) { if (!tryAllocChild()) { ok = false; break; } }
```

5. **הוסף קריאה ל-tryAllocChild בתנאי "not together"** (אחרי שורה 49):
```javascript
while ((n.children||0) > 0 && tryAllocChild()) n.children--;
```

6. **עדכן בדיקת covered** (שורה 50):
```javascript
const covered = (n.couples===0 && n.males===0 && n.females===0 && (n.children||0)===0);
```

7. **עדכן matchNewOffer** - הוסף children ל-need (שורה 79):
```javascript
const need = { couples: r.couples_count||0, males: r.passengers_male||0, females: r.passengers_female||0, children: r.children_count||0 };
```

8. **עדכן matchNewRequest** - הוסף children (שורה 160):
```javascript
let remaining = { couples: request.couples_count||0, males: request.passengers_male||0, females: request.passengers_female||0, children: request.children_count||0 };
```

9. **עדכן remainingTotal** (שורה 161):
```javascript
const remainingTotal = () => remaining.couples * 2 + remaining.males + remaining.females + (remaining.children||0);
```

10. **עדכן את need ב-matchNewRequest logging** (שורה 167-171):
```javascript
need: {
  couples: request.couples_count||0,
  males: request.passengers_male||0,
  females: request.passengers_female||0,
  children: request.children_count||0
},
```

### 2. קבצי הקלטה (public/audio/he/)

צריך ליצור/הקליט קבצי אודיו חדשים:

1. **how_many_children.mp3** - "כמה ילדים מצטרפים?"
2. **including.mp3** - "כולל"  
3. **children.mp3** - "ילדים"

ניתן ליצור אותם עם:
```bash
npm run generate-audio
```

או להשתמש ב-`scripts/tts-generate.js` עם המפתח ב-`tts-key.json`

## 🧪 בדיקות

לאחר השלמת השינויים, בדוק:

1. ✅ הרצת migration: `npm run migrate`
2. ⚠️ בדיקת זרימת rider עם ילדים
3. ⚠️ בדיקת matching עם ילדים
4. ⚠️ בדיקה שילדים יכולים לתפוס מקומות male/female/unixxxxxn
## לוגיקת ילדים

- ילדים הם **בנוסף** למבוגרים (male + female)
- ילדים יכולים לתפוס **כל סוג מקום** (male_only, female_only, anygender)
- סה"כ נוסעים = `passengers_male + passengers_female + children_count`
- באלגוריתם ההתאמה, ילדים מוקצים **אחרי** המבוגרים
- ילדים מעדיפים מקומות anygender, אבל יכולים לתפוס כל מקום פנוי

# מערכת ניהול דירות

מערכת Full Stack בעברית וב־RTL למנהל נכס יחיד. לכל דירה דף עצמאי עם דייר, שכירות, קריאות חשמל ומים, חיובים חודשיים, תשלומים חלקיים, אישורי תשלום, מסמכים והיסטוריה כספית.

## הרצה מקומית

דרישות: Node.js 20 ומעלה ו־Docker Desktop.

```powershell
docker compose up -d
cd backend
Copy-Item .env.example .env
npm install
npm start
```

בחלון נוסף:

```powershell
cd frontend
npm install
npm run dev
```

האתר זמין ב־`http://localhost:5173`. פרטי הכניסה המקומיים הם שם המשתמש `Rani` והסיסמה `zezeee`. מומלץ להחליף מיד את הסיסמה במסך ההגדרות.

## בדיקות

```powershell
cd frontend
npm run build

cd ../backend
npm run verify
npm audit --omit=dev
```

בדיקת האימות יוצרת דירת בדיקה ומוודאת חישובי צריכה, שמירת תעריפים היסטוריים, מניעת חודש כפול, תשלום חלקי, השלמת יתרה, PDF ו־Excel.

## Supabase ו־Railway

1. יוצרים פרויקט Supabase ומעתיקים את מחרוזת החיבור של PostgreSQL.
2. ב־Railway מגדירים את תיקיית השירות כ־`backend` ואת פקודת ההפעלה כ־`npm start`.
3. מגדירים:
   - `DATABASE_URL`
   - `DATABASE_SSL=true`
   - `JWT_SECRET` — ערך אקראי ארוך
   - `CORS_ORIGIN` — כתובת ה־Vercel
   - `VERCEL_PROJECT_NAME` ו־`VERCEL_TEAM_SLUG` — מאפשרים גם כתובות Preview של אותו פרויקט בלבד
   - `ADMIN_USERNAME`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD` — משמש רק ביצירת המנהל הראשונה
   - `ADMIN_NAME`
4. הסכמה נוצרת אוטומטית בהפעלה הראשונה. הרשאות בסיס הנתונים נשארות בשרת בלבד.

## Vercel

1. מגדירים את Root Directory כ־`frontend`.
2. Build Command: `npm run build`.
3. Output Directory: `dist`.
4. מגדירים `VITE_API_URL` לכתובת Railway, ללא `/api` בסוף.

## אבטחה ומסמכים

- סיסמאות נשמרות עם bcrypt.
- כל נתיבי הניהול מוגנים ב־JWT ל־12 שעות.
- פעולות חיוב ותשלום מתבצעות בטרנזקציות PostgreSQL.
- חישובים כספיים מתבצעים ומאומתים בשרת.
- אישורי התשלום מסומנים במפורש כמסמכים פנימיים, ולא כחשבוניות מס או קבלות חוקיות.
- אין להעביר `DATABASE_URL`, סיסמאות או מפתחות Supabase לקוד ה־Frontend.

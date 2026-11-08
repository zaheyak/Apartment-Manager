import { AppError } from '../lib/errors.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'המשאב לא נמצא' });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'הרשומה כבר קיימת' });
  }
  if (err.code === '23514') {
    return res.status(400).json({ error: 'הנתונים אינם עומדים בכללי החישוב' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'קובץ ה-Excel גדול מדי. הגודל המרבי הוא 5MB' });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'ניתן להעלות קובץ Excel אחד בכל פעם' });
  }
  console.error(err);
  return res.status(500).json({ error: 'אירעה שגיאה בשרת' });
}

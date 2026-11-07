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
  console.error(err);
  return res.status(500).json({ error: 'אירעה שגיאה בשרת' });
}

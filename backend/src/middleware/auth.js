import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'נדרשת התחברות' });
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'ההתחברות פגה, יש להתחבר מחדש' });
  }
}

export function signAdmin(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, name: admin.full_name },
    config.jwtSecret,
    { expiresIn: '12h' },
  );
}

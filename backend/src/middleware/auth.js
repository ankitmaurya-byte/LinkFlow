import { verifyAccess } from '../services/tokens.js';
import { AppError } from './error.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) return next(new AppError('AUTH_INVALID', 'Missing bearer token', 401));
  try {
    const payload = verifyAccess(match[1]);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (e) {
    if (e?.name === 'TokenExpiredError') {
      return next(new AppError('AUTH_EXPIRED', 'Access token expired', 401));
    }
    next(new AppError('AUTH_INVALID', 'Invalid token', 401));
  }
}

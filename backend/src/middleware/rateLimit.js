import rateLimit from 'express-rate-limit';

// 100/min is permissive for development. Tighten via env (PER_IP_AUTH_RATE) for production.
// Tests bypass entirely — supertest shares one IP across many requests, so any meaningful
// limit will spuriously trip on a busy test file.
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.PER_IP_AUTH_RATE || '100', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});

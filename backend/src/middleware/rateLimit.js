import rateLimit from 'express-rate-limit';

// 100/min is permissive for development + tests. Tighten via env (PER_IP_AUTH_RATE) for production.
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.PER_IP_AUTH_RATE || '100', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});

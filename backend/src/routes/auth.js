import express from 'express';
import { User } from '../models/user.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { signAccess, issueRefresh } from '../services/tokens.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

export const router = express.Router();

function publicUser(u) {
  return { id: u._id.toString(), username: u.username, createdAt: u.createdAt };
}

const USERNAME_RE = /^[a-z0-9_-]+$/;

function validateCreds(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new AppError('VALIDATION', 'username and password required', 400);
  }
  const u = username.toLowerCase();
  if (u.length < 3 || u.length > 32 || !USERNAME_RE.test(u)) {
    throw new AppError('VALIDATION', 'username must be 3-32 chars of [a-z0-9_-]', 400);
  }
  if (password.length < 8) {
    throw new AppError('VALIDATION', 'password must be at least 8 characters', 400);
  }
}

router.post('/signup', async (req, res, next) => {
  try {
    validateCreds(req.body);
    const passwordHash = await hashPassword(req.body.password);
    const user = await User.create({ username: req.body.username, passwordHash });
    const accessToken = signAccess({ userId: user._id, username: user.username });
    const { token: refreshToken } = await issueRefresh(user._id);
    res.json({ accessToken, refreshToken, user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    validateCreds(req.body);
    const user = await User.findOne({ username: req.body.username.toLowerCase() }).select('+passwordHash');
    if (!user) throw new AppError('AUTH_INVALID', 'Invalid credentials', 401);
    const ok = await verifyPassword(req.body.password, user.passwordHash);
    if (!ok) throw new AppError('AUTH_INVALID', 'Invalid credentials', 401);
    const accessToken = signAccess({ userId: user._id, username: user.username });
    const { token: refreshToken } = await issueRefresh(user._id);
    res.json({ accessToken, refreshToken, user: publicUser(user) });
  } catch (e) { next(e); }
});

export const meRouter = express.Router();

meRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

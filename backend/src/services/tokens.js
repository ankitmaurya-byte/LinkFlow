import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { RefreshToken } from '../models/refreshToken.js';
import { AppError } from '../middleware/error.js';

export function signAccess({ userId, username }) {
  return jwt.sign(
    { sub: userId.toString(), username },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.jwtAccessTtlSeconds }
  );
}

export function verifyAccess(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefresh(userId) {
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 86400 * 1000);
  const record = await RefreshToken.create({ userId, tokenHash: hash(token), expiresAt });
  return { token, record };
}

export async function rotateRefresh(presentedToken) {
  const tokenHash = hash(presentedToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError('AUTH_INVALID', 'Refresh token invalid', 401);
  }
  record.revokedAt = new Date();
  await record.save();
  return issueRefresh(record.userId);
}

export async function revokeRefresh(presentedToken) {
  const tokenHash = hash(presentedToken);
  await RefreshToken.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
}

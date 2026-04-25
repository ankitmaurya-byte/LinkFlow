import mongoose from 'mongoose';
import { verifyAccess } from '../services/tokens.js';
import { AppError } from './error.js';
import { User } from '../models/user.js';
import { Friendship } from '../models/friendship.js';
import { GroupMember } from '../models/groupMember.js';

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

export function requireFriendOf(paramName = 'username') {
  return async (req, _res, next) => {
    try {
      const username = req.params[paramName];
      const target = await User.findOne({ username: (username || '').toLowerCase() });
      if (!target) return next(new AppError('NOT_FOUND', 'User not found', 404));
      if (target._id.equals(req.user.id)) {
        req.targetUser = target;
        return next();
      }
      const me = new mongoose.Types.ObjectId(req.user.id);
      const pair = Friendship.normalizePair(me, target._id);
      const f = await Friendship.findOne({ ...pair, status: 'accepted' });
      if (!f) return next(new AppError('FORBIDDEN', 'Not friends', 403));
      req.targetUser = target;
      next();
    } catch (e) { next(e); }
  };
}

export function requireGroupMember(paramName = 'id') {
  return async (req, _res, next) => {
    try {
      const groupId = req.params[paramName];
      if (!mongoose.isValidObjectId(groupId)) return next(new AppError('NOT_FOUND', 'Not found', 404));
      const m = await GroupMember.findOne({ groupId, userId: req.user.id });
      if (!m) return next(new AppError('FORBIDDEN', 'Not a member', 403));
      req.groupMember = m;
      next();
    } catch (e) { next(e); }
  };
}

export function requireGroupAdmin(paramName = 'id') {
  return async (req, _res, next) => {
    try {
      const groupId = req.params[paramName];
      if (!mongoose.isValidObjectId(groupId)) return next(new AppError('NOT_FOUND', 'Not found', 404));
      const m = await GroupMember.findOne({ groupId, userId: req.user.id, role: 'admin' });
      if (!m) return next(new AppError('FORBIDDEN', 'Admin only', 403));
      req.groupMember = m;
      next();
    } catch (e) { next(e); }
  };
}

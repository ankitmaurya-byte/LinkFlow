import express from 'express';
import mongoose from 'mongoose';
import { ChatMessage } from '../models/chatMessage.js';
import { GroupMember } from '../models/groupMember.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const { groupIds = [], kind = 'url', url, text, title, platform, payload } = req.body || {};
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      throw new AppError('VALIDATION', 'groupIds required', 400);
    }
    const allowedKinds = ['url', 'text', 'folder', 'bookmark'];
    if (!allowedKinds.includes(kind)) {
      throw new AppError('VALIDATION', 'invalid kind', 400);
    }
    if (kind === 'url' && (typeof url !== 'string' || !url.trim())) {
      throw new AppError('VALIDATION', 'url required', 400);
    }

    const validIds = groupIds.filter(id => mongoose.isValidObjectId(id));
    if (validIds.length === 0) throw new AppError('VALIDATION', 'no valid groupIds', 400);

    const memberships = await GroupMember.find({ userId: req.user.id, groupId: { $in: validIds } });
    const allowedGroupIds = memberships.map(m => m.groupId.toString());
    if (allowedGroupIds.length === 0) {
      throw new AppError('FORBIDDEN', 'Not a member of any of those groups', 403);
    }

    const docs = allowedGroupIds.map(gid => ({
      groupId: gid,
      senderId: req.user.id,
      kind,
      url: typeof url === 'string' ? url.trim() : null,
      text: typeof text === 'string' ? text.trim().slice(0, 4000) : null,
      title: typeof title === 'string' ? title.trim().slice(0, 400) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 64) : null,
      payload: payload || null
    }));
    const created = await ChatMessage.insertMany(docs);
    res.json({
      shared: created.map(m => ({
        id: m._id.toString(),
        groupId: m.groupId.toString()
      }))
    });
  } catch (e) { next(e); }
});

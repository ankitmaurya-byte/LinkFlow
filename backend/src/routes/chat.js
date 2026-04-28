import express from 'express';
import { ChatMessage } from '../models/chatMessage.js';
import { User } from '../models/user.js';
import { requireAuth, requireGroupMember } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function publicMsg(m, usernameById) {
  return {
    id: m._id.toString(),
    groupId: m.groupId.toString(),
    senderId: m.senderId.toString(),
    senderUsername: usernameById ? usernameById.get(m.senderId.toString()) || null : null,
    kind: m.kind,
    url: m.url,
    text: m.text,
    title: m.title,
    platform: m.platform,
    payload: m.payload,
    createdAt: m.createdAt
  };
}

router.get('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const filter = { groupId: req.params.id };
    if (req.query.before) {
      const d = new Date(req.query.before);
      if (Number.isNaN(d.valueOf())) throw new AppError('VALIDATION', 'invalid before', 400);
      filter.createdAt = { $lt: d };
    }
    const list = await ChatMessage.find(filter).sort({ createdAt: 1 }).limit(limit);
    const senderIds = [...new Set(list.map(m => m.senderId.toString()))];
    const users = await User.find({ _id: { $in: senderIds } }, { username: 1 });
    const usernameById = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({ messages: list.map(m => publicMsg(m, usernameById)) });
  } catch (e) { next(e); }
});

router.post('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const { kind = 'text', url, text, title, platform, payload } = req.body || {};
    const allowedKinds = ['url', 'text', 'folder', 'bookmark'];
    if (!allowedKinds.includes(kind)) {
      throw new AppError('VALIDATION', 'invalid kind', 400);
    }
    if (kind === 'url' && (typeof url !== 'string' || !url.trim())) {
      throw new AppError('VALIDATION', 'url required', 400);
    }
    if (kind === 'text' && (typeof text !== 'string' || !text.trim())) {
      throw new AppError('VALIDATION', 'text required', 400);
    }
    const created = await ChatMessage.create({
      groupId: req.params.id,
      senderId: req.user.id,
      kind,
      url: typeof url === 'string' ? url.trim() : null,
      text: typeof text === 'string' ? text.trim().slice(0, 4000) : null,
      title: typeof title === 'string' ? title.trim().slice(0, 400) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 64) : null,
      payload: payload || null
    });
    const usernameById = new Map([[req.user.id, req.user.username]]);
    res.json({ message: publicMsg(created, usernameById) });
  } catch (e) { next(e); }
});

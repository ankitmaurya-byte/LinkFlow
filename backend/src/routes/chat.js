import express from 'express';
import { ChatMessage } from '../models/chatMessage.js';
import { requireAuth, requireGroupMember } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function publicMsg(m) {
  return {
    id: m._id.toString(),
    groupId: m.groupId.toString(),
    senderId: m.senderId.toString(),
    kind: m.kind,
    url: m.url,
    title: m.title,
    platform: m.platform,
    createdAt: m.createdAt
  };
}

router.get('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const filter = { groupId: req.params.id };
    if (req.query.before) {
      const d = new Date(req.query.before);
      if (Number.isNaN(d.valueOf())) throw new AppError('VALIDATION', 'invalid before', 400);
      filter.createdAt = { $lt: d };
    }
    const list = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ messages: list.map(publicMsg) });
  } catch (e) { next(e); }
});

router.post('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const { url, title, platform } = req.body || {};
    if (typeof url !== 'string' || !url.trim()) {
      throw new AppError('VALIDATION', 'url required', 400);
    }
    const created = await ChatMessage.create({
      groupId: req.params.id,
      senderId: req.user.id,
      kind: 'url',
      url: url.trim(),
      title: typeof title === 'string' ? title.trim().slice(0, 400) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 64) : null
    });
    res.json({ message: publicMsg(created) });
  } catch (e) { next(e); }
});

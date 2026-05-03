import express from 'express';
import { ChatMessage } from '../models/chatMessage.js';
import { User } from '../models/user.js';
import { requireAuth, requireGroupMember } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function publicMsg(m, usernameById, replyMap) {
  const replyToId = m.replyToId ? m.replyToId.toString() : null;
  let replyTo = null;
  if (replyToId && replyMap && replyMap.has(replyToId)) {
    const r = replyMap.get(replyToId);
    replyTo = {
      id: r._id.toString(),
      senderUsername: usernameById ? usernameById.get(r.senderId.toString()) || null : null,
      kind: r.kind,
      text: r.text,
      title: r.title,
      url: r.url
    };
  }
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
    replyToId,
    replyTo,
    mentions: m.mentions || [],
    reactions: m.reactions || {},
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
    const replyIds = [...new Set(list.map(m => m.replyToId?.toString()).filter(Boolean))];
    const replies = replyIds.length ? await ChatMessage.find({ _id: { $in: replyIds } }) : [];
    const replyMap = new Map(replies.map(r => [r._id.toString(), r]));
    const senderIds = [...new Set([
      ...list.map(m => m.senderId.toString()),
      ...replies.map(r => r.senderId.toString())
    ])];
    const users = await User.find({ _id: { $in: senderIds } }, { username: 1 });
    const usernameById = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({ messages: list.map(m => publicMsg(m, usernameById, replyMap)) });
  } catch (e) { next(e); }
});

router.post('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const { kind = 'text', url, text, title, platform, payload, replyToId, mentions } = req.body || {};
    const allowedKinds = ['url', 'text', 'folder', 'bookmark', 'todo'];
    if (!allowedKinds.includes(kind)) {
      throw new AppError('VALIDATION', 'invalid kind', 400);
    }
    if (kind === 'url' && (typeof url !== 'string' || !url.trim())) {
      throw new AppError('VALIDATION', 'url required', 400);
    }
    if (kind === 'text' && (typeof text !== 'string' || !text.trim())) {
      throw new AppError('VALIDATION', 'text required', 400);
    }
    const cleanMentions = Array.isArray(mentions)
      ? mentions.filter(m => typeof m === 'string' && m.length <= 64).slice(0, 20)
      : [];
    const created = await ChatMessage.create({
      groupId: req.params.id,
      senderId: req.user.id,
      kind,
      url: typeof url === 'string' ? url.trim() : null,
      text: typeof text === 'string' ? text.trim().slice(0, 4000) : null,
      title: typeof title === 'string' ? title.trim().slice(0, 400) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 64) : null,
      payload: payload || null,
      replyToId: replyToId || null,
      mentions: cleanMentions
    });
    let replyMap = null;
    if (replyToId) {
      const r = await ChatMessage.findById(replyToId);
      if (r) replyMap = new Map([[r._id.toString(), r]]);
    }
    const senderIds = [req.user.id];
    if (replyMap) for (const r of replyMap.values()) senderIds.push(r.senderId.toString());
    const users = await User.find({ _id: { $in: [...new Set(senderIds)] } }, { username: 1 });
    const usernameById = new Map(users.map(u => [u._id.toString(), u.username]));
    if (!usernameById.has(req.user.id)) usernameById.set(req.user.id, req.user.username);
    res.json({ message: publicMsg(created, usernameById, replyMap) });
  } catch (e) { next(e); }
});

router.post('/:msgId/react', requireGroupMember('id'), async (req, res, next) => {
  try {
    const { emoji } = req.body || {};
    if (typeof emoji !== 'string' || !emoji.trim() || emoji.length > 8) {
      throw new AppError('VALIDATION', 'emoji required', 400);
    }
    const msg = await ChatMessage.findOne({ _id: req.params.msgId, groupId: req.params.id });
    if (!msg) throw new AppError('NOT_FOUND', 'message not found', 404);
    const reactions = msg.reactions && typeof msg.reactions === 'object' ? { ...msg.reactions } : {};
    const list = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
    const uid = req.user.id.toString();
    const idx = list.indexOf(uid);
    if (idx >= 0) list.splice(idx, 1); else list.push(uid);
    if (list.length) reactions[emoji] = list; else delete reactions[emoji];
    msg.reactions = reactions;
    msg.markModified('reactions');
    await msg.save();
    res.json({ reactions: msg.reactions });
  } catch (e) { next(e); }
});

import express from 'express';
import mongoose from 'mongoose';
import { ChatMessage } from '../models/chatMessage.js';
import { Group } from '../models/group.js';
import { GroupMember } from '../models/groupMember.js';
import { Friendship } from '../models/friendship.js';
import { User } from '../models/user.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function makeInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Find or create a 2-person DM group between requester and otherUserId.
async function ensureDMGroup(meId, otherUserId) {
  // Find existing group where both members exist with role member/admin and member count = 2.
  const myGroups = await GroupMember.find({ userId: meId }).select('groupId');
  const ids = myGroups.map(m => m.groupId);
  if (ids.length) {
    const otherInSame = await GroupMember.find({
      groupId: { $in: ids },
      userId: otherUserId
    }).select('groupId');
    for (const m of otherInSame) {
      const count = await GroupMember.countDocuments({ groupId: m.groupId });
      if (count === 2) return m.groupId.toString();
    }
  }
  // Create new pairwise group
  const other = await User.findById(otherUserId).select('username');
  const me = await User.findById(meId).select('username');
  if (!other) throw new AppError('NOT_FOUND', 'User not found', 404);
  const g = await Group.create({
    name: `DM @${me.username} ↔ @${other.username}`,
    adminId: meId,
    inviteCode: makeInviteCode()
  });
  await GroupMember.insertMany([
    { groupId: g._id, userId: meId, role: 'admin' },
    { groupId: g._id, userId: otherUserId, role: 'member' }
  ]);
  return g._id.toString();
}

router.post('/', async (req, res, next) => {
  try {
    const { groupIds = [], userIds = [], kind = 'url', url, text, title, platform, payload } = req.body || {};
    if ((!Array.isArray(groupIds) || groupIds.length === 0) &&
        (!Array.isArray(userIds) || userIds.length === 0)) {
      throw new AppError('VALIDATION', 'groupIds or userIds required', 400);
    }
    const allowedKinds = ['url', 'text', 'folder', 'bookmark'];
    if (!allowedKinds.includes(kind)) {
      throw new AppError('VALIDATION', 'invalid kind', 400);
    }
    if (kind === 'url' && (typeof url !== 'string' || !url.trim())) {
      throw new AppError('VALIDATION', 'url required', 400);
    }

    const targetGroupIds = new Set();

    // Direct groups: must be a member.
    const validGroupIds = (groupIds || []).filter(id => mongoose.isValidObjectId(id));
    if (validGroupIds.length) {
      const memberships = await GroupMember.find({ userId: req.user.id, groupId: { $in: validGroupIds } });
      memberships.forEach(m => targetGroupIds.add(m.groupId.toString()));
    }

    // User DMs: must be friends, then ensure pairwise group exists.
    const validUserIds = (userIds || []).filter(id => mongoose.isValidObjectId(id));
    if (validUserIds.length) {
      const me = new mongoose.Types.ObjectId(req.user.id);
      for (const otherIdStr of validUserIds) {
        const other = new mongoose.Types.ObjectId(otherIdStr);
        const pair = Friendship.normalizePair(me, other);
        const f = await Friendship.findOne({ ...pair, status: 'accepted' });
        if (!f) continue; // skip non-friends silently
        const gid = await ensureDMGroup(req.user.id, otherIdStr);
        targetGroupIds.add(gid);
      }
    }

    if (targetGroupIds.size === 0) {
      throw new AppError('FORBIDDEN', 'No valid share targets', 403);
    }

    const docs = Array.from(targetGroupIds).map(gid => ({
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

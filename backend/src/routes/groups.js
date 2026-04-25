import express from 'express';
import mongoose from 'mongoose';
import { Group } from '../models/group.js';
import { GroupMember } from '../models/groupMember.js';
import { JoinRequest } from '../models/joinRequest.js';
import { User } from '../models/user.js';
import { GroupFolder } from '../models/groupFolder.js';
import { requireAuth, requireGroupMember, requireGroupAdmin } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function publicGroup(g) {
  return {
    id: g._id.toString(),
    parentGroupId: g.parentGroupId ? g.parentGroupId.toString() : null,
    name: g.name,
    adminId: g.adminId.toString(),
    createdAt: g.createdAt
  };
}

router.post('/', async (req, res, next) => {
  try {
    const { name, parentGroupId } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('VALIDATION', 'name required', 400);
    }
    let parent = null;
    if (parentGroupId) {
      if (!mongoose.isValidObjectId(parentGroupId)) {
        throw new AppError('VALIDATION', 'invalid parentGroupId', 400);
      }
      parent = await Group.findById(parentGroupId);
      if (!parent) throw new AppError('VALIDATION', 'parent group not found', 400);
      const m = await GroupMember.findOne({ groupId: parent._id, userId: req.user.id });
      if (!m) throw new AppError('FORBIDDEN', 'Not a member of parent group', 403);
    }
    const created = await Group.create({
      name: name.trim(),
      parentGroupId: parent ? parent._id : null,
      adminId: req.user.id
    });
    await GroupMember.create({ groupId: created._id, userId: req.user.id, role: 'admin' });
    res.json({ group: publicGroup(created) });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const memberships = await GroupMember.find({ userId: req.user.id });
    const ids = memberships.map(m => m.groupId);
    const groups = await Group.find({ _id: { $in: ids } }).sort({ createdAt: 1 });
    res.json({ groups: groups.map(publicGroup) });
  } catch (e) { next(e); }
});

router.get('/:id', requireGroupMember('id'), async (req, res, next) => {
  try {
    const g = await Group.findById(req.params.id);
    if (!g) throw new AppError('NOT_FOUND', 'Not found', 404);
    res.json({ group: publicGroup(g) });
  } catch (e) { next(e); }
});

router.get('/:id/children', requireGroupMember('id'), async (req, res, next) => {
  try {
    const list = await Group.find({ parentGroupId: req.params.id }).sort({ createdAt: 1 });
    res.json({ groups: list.map(publicGroup) });
  } catch (e) { next(e); }
});

router.post('/:id/join', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const g = await Group.findById(req.params.id);
    if (!g) throw new AppError('NOT_FOUND', 'Not found', 404);

    const existingMember = await GroupMember.findOne({ groupId: g._id, userId: req.user.id });
    if (existingMember) throw new AppError('CONFLICT', 'Already a member', 409);
    const existingPending = await JoinRequest.findOne({ groupId: g._id, userId: req.user.id, status: 'pending' });
    if (existingPending) throw new AppError('CONFLICT', 'Request already pending', 409);

    const jr = await JoinRequest.create({ groupId: g._id, userId: req.user.id, status: 'pending' });
    res.json({ request: { id: jr._id.toString(), status: jr.status } });
  } catch (e) { next(e); }
});

router.get('/:id/requests', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const list = await JoinRequest.find({ groupId: req.params.id, status: 'pending' });
    const userIds = list.map(r => r.userId);
    const users = await User.find({ _id: { $in: userIds } }, { username: 1 });
    const byId = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({
      requests: list.map(r => ({
        id: r._id.toString(),
        userId: r.userId.toString(),
        username: byId.get(r.userId.toString()),
        createdAt: r.createdAt
      }))
    });
  } catch (e) { next(e); }
});

router.post('/:id/requests/:reqId/approve', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const jr = await JoinRequest.findOne({ _id: req.params.reqId, groupId: req.params.id, status: 'pending' });
    if (!jr) throw new AppError('NOT_FOUND', 'Not found', 404);
    jr.status = 'approved';
    await jr.save();
    await GroupMember.updateOne(
      { groupId: jr.groupId, userId: jr.userId },
      { $setOnInsert: { groupId: jr.groupId, userId: jr.userId, role: 'member' } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id/requests/:reqId', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const jr = await JoinRequest.findOne({ _id: req.params.reqId, groupId: req.params.id, status: 'pending' });
    if (!jr) throw new AppError('NOT_FOUND', 'Not found', 404);
    jr.status = 'rejected';
    await jr.save();
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get('/:id/members', requireGroupMember('id'), async (req, res, next) => {
  try {
    const ms = await GroupMember.find({ groupId: req.params.id });
    const users = await User.find({ _id: { $in: ms.map(m => m.userId) } }, { username: 1 });
    const byId = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({
      members: ms.map(m => ({
        userId: m.userId.toString(),
        username: byId.get(m.userId.toString()),
        role: m.role,
        joinedAt: m.joinedAt
      }))
    });
  } catch (e) { next(e); }
});

router.delete('/:id/members/:userId', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) {
      const adminCount = await GroupMember.countDocuments({ groupId: req.params.id, role: 'admin' });
      if (adminCount <= 1) {
        throw new AppError('VALIDATION', 'sole admin cannot leave', 400);
      }
    }
    const r = await GroupMember.deleteOne({ groupId: req.params.id, userId: req.params.userId });
    if (r.deletedCount === 0) throw new AppError('NOT_FOUND', 'Member not found', 404);
    res.status(204).end();
  } catch (e) { next(e); }
});

function publicFolder(f) {
  return {
    id: f._id.toString(),
    groupId: f.groupId.toString(),
    parentFolderId: f.parentFolderId ? f.parentFolderId.toString() : null,
    name: f.name,
    createdAt: f.createdAt
  };
}

router.get('/:id/folders', requireGroupMember('id'), async (req, res, next) => {
  try {
    const parentFolderId = (req.query.parentFolderId && req.query.parentFolderId !== 'null')
      ? req.query.parentFolderId : null;
    const folders = await GroupFolder.find({ groupId: req.params.id, parentFolderId }).sort({ createdAt: 1 });
    res.json({ folders: folders.map(publicFolder) });
  } catch (e) { next(e); }
});

router.post('/:id/folders', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const { name, parentFolderId } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('VALIDATION', 'name required', 400);
    }
    let parent = null;
    if (parentFolderId) {
      if (!mongoose.isValidObjectId(parentFolderId)) {
        throw new AppError('VALIDATION', 'invalid parentFolderId', 400);
      }
      parent = await GroupFolder.findOne({ _id: parentFolderId, groupId: req.params.id });
      if (!parent) throw new AppError('VALIDATION', 'parent folder not in group', 400);
    }
    const created = await GroupFolder.create({
      groupId: req.params.id,
      parentFolderId: parent ? parent._id : null,
      name: name.trim()
    });
    res.json({ folder: publicFolder(created) });
  } catch (e) { next(e); }
});

router.delete('/:id/folders/:fid', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const root = await GroupFolder.findOne({ _id: req.params.fid, groupId: req.params.id });
    if (!root) throw new AppError('NOT_FOUND', 'Not found', 404);
    const toDelete = [root._id];
    let frontier = [root._id];
    while (frontier.length) {
      const children = await GroupFolder.find({ parentFolderId: { $in: frontier }, groupId: req.params.id }, { _id: 1 });
      frontier = children.map(c => c._id);
      for (const c of children) toDelete.push(c._id);
    }
    await GroupFolder.deleteMany({ _id: { $in: toDelete }, groupId: req.params.id });
    res.status(204).end();
  } catch (e) { next(e); }
});

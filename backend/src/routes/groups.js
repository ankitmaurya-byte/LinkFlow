import express from 'express';
import mongoose from 'mongoose';
import { Group } from '../models/group.js';
import { GroupMember } from '../models/groupMember.js';
import { requireAuth, requireGroupMember } from '../middleware/auth.js';
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

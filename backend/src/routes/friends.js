import express from 'express';
import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { Friendship } from '../models/friendship.js';
import { Bookmark } from '../models/bookmark.js';
import { requireAuth, requireFriendOf } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function publicFriendship(f) {
  return {
    id: f._id.toString(),
    userA: f.userA.toString(),
    userB: f.userB.toString(),
    requesterId: f.requesterId.toString(),
    status: f.status,
    createdAt: f.createdAt
  };
}

router.post('/request', async (req, res, next) => {
  try {
    const { username } = req.body || {};
    if (typeof username !== 'string' || !username.trim()) {
      throw new AppError('VALIDATION', 'username required', 400);
    }
    if (username.toLowerCase() === req.user.username) {
      throw new AppError('VALIDATION', 'cannot friend yourself', 400);
    }
    const target = await User.findOne({ username: username.toLowerCase() });
    if (!target) throw new AppError('NOT_FOUND', 'User not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const pair = Friendship.normalizePair(me, target._id);
    const exists = await Friendship.findOne(pair);
    if (exists) throw new AppError('CONFLICT', 'Friendship already exists', 409);
    const created = await Friendship.create({ ...pair, requesterId: me, status: 'pending' });
    res.json({ friendship: publicFriendship(created) });
  } catch (e) { next(e); }
});

router.get('/requests', async (req, res, next) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user.id);
    const all = await Friendship.find({
      $or: [{ userA: me }, { userB: me }],
      status: 'pending'
    });
    const outgoing = all.filter(f => f.requesterId.equals(me)).map(publicFriendship);
    const incoming = all.filter(f => !f.requesterId.equals(me)).map(publicFriendship);
    res.json({ incoming, outgoing });
  } catch (e) { next(e); }
});

router.post('/:id/accept', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const f = await Friendship.findById(req.params.id);
    if (!f) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (!(f.userA.equals(me) || f.userB.equals(me))) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (f.requesterId.equals(me)) throw new AppError('FORBIDDEN', 'Only addressee can accept', 403);
    if (f.status === 'accepted') return res.json({ friendship: publicFriendship(f) });
    f.status = 'accepted';
    await f.save();
    res.json({ friendship: publicFriendship(f) });
  } catch (e) { next(e); }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const f = await Friendship.findById(req.params.id);
    if (!f) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (!(f.userA.equals(me) || f.userB.equals(me))) throw new AppError('NOT_FOUND', 'Not found', 404);
    await f.deleteOne();
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user.id);
    const accepted = await Friendship.find({
      $or: [{ userA: me }, { userB: me }],
      status: 'accepted'
    });
    const ids = accepted.map(f => f.userA.equals(me) ? f.userB : f.userA);
    const users = await User.find({ _id: { $in: ids } });
    res.json({
      friends: users.map(u => ({ id: u._id.toString(), username: u.username }))
    });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const f = await Friendship.findById(req.params.id);
    if (!f) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (!(f.userA.equals(me) || f.userB.equals(me))) throw new AppError('NOT_FOUND', 'Not found', 404);
    await f.deleteOne();
    res.status(204).end();
  } catch (e) { next(e); }
});

export const userBookmarksRouter = express.Router();

userBookmarksRouter.get('/users/:username/bookmarks', requireAuth, requireFriendOf('username'), async (req, res, next) => {
  try {
    const target = req.targetUser;
    const parentIdRaw = req.query.parentId;
    const parentId = (parentIdRaw && parentIdRaw !== 'null') ? parentIdRaw : null;
    const list = await Bookmark.find({ ownerId: target._id, parentId }).sort({ createdAt: 1 });
    res.json({ bookmarks: list.map(b => ({
      id: b._id.toString(),
      parentId: b.parentId ? b.parentId.toString() : null,
      kind: b.kind,
      name: b.name,
      url: b.url,
      platform: b.platform,
      createdAt: b.createdAt
    })) });
  } catch (e) { next(e); }
});

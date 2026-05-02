import express from 'express';
import mongoose from 'mongoose';
import { Blog } from '../models/blog.js';
import { User } from '../models/user.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
export const publicRouter = express.Router();

function pub(b, username) {
  return {
    id: b._id.toString(),
    ownerId: b.ownerId.toString(),
    ownerUsername: username || null,
    title: b.title,
    body: b.body,
    coverImage: b.coverImage || '',
    isPublic: !!b.isPublic,
    slug: b.slug || null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt
  };
}

function mkSlug() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const list = await Blog.find({ ownerId: req.user.id }).sort({ updatedAt: -1 });
    res.json({ blogs: list.map(b => pub(b, req.user.username)) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title = 'Untitled', body = '', coverImage = '' } = req.body || {};
    const b = await Blog.create({
      ownerId: req.user.id,
      title: title.toString().slice(0, 280) || 'Untitled',
      body: body.toString().slice(0, 100000),
      coverImage: coverImage.toString().slice(0, 2048)
    });
    res.json({ blog: pub(b, req.user.username) });
  } catch (e) { next(e); }
});

router.get('/feed', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const filter = { isPublic: true };
    if (req.query.before) {
      const d = new Date(req.query.before);
      if (!Number.isNaN(d.valueOf())) filter.createdAt = { $lt: d };
    }
    const list = await Blog.find(filter).sort({ createdAt: -1 }).limit(limit);
    const ownerIds = [...new Set(list.map(b => b.ownerId.toString()))];
    const users = await User.find({ _id: { $in: ownerIds } }, { username: 1 });
    const byId = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({ blogs: list.map(b => pub(b, byId.get(b.ownerId.toString()))) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const b = await Blog.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!b) throw new AppError('NOT_FOUND', 'Not found', 404);
    res.json({ blog: pub(b, req.user.username) });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const b = await Blog.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!b) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (typeof req.body.title === 'string') b.title = req.body.title.slice(0, 280) || 'Untitled';
    if (typeof req.body.body === 'string') b.body = req.body.body.slice(0, 100000);
    if (typeof req.body.coverImage === 'string') b.coverImage = req.body.coverImage.slice(0, 2048);
    if (typeof req.body.isPublic === 'boolean') {
      b.isPublic = req.body.isPublic;
      if (b.isPublic && !b.slug) b.slug = mkSlug();
    }
    await b.save();
    res.json({ blog: pub(b, req.user.username) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const b = await Blog.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
    if (!b) throw new AppError('NOT_FOUND', 'Not found', 404);
    res.status(204).end();
  } catch (e) { next(e); }
});

publicRouter.get('/:slug', async (req, res, next) => {
  try {
    const b = await Blog.findOne({ slug: req.params.slug, isPublic: true });
    if (!b) throw new AppError('NOT_FOUND', 'Not found', 404);
    const author = await User.findById(b.ownerId, { username: 1 });
    res.json({ blog: pub(b, author?.username) });
  } catch (e) { next(e); }
});

import express from 'express';
import mongoose from 'mongoose';
import { Post } from '../models/post.js';
import { PostComment } from '../models/postComment.js';
import { PostLike } from '../models/postLike.js';
import { User } from '../models/user.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

async function decoratePosts(posts, viewerId) {
  if (posts.length === 0) return [];
  const ownerIds = [...new Set(posts.map(p => p.ownerId.toString()))];
  const users = await User.find({ _id: { $in: ownerIds } }, { username: 1 });
  const usernameById = new Map(users.map(u => [u._id.toString(), u.username]));
  const myLikes = await PostLike.find(
    { userId: viewerId, postId: { $in: posts.map(p => p._id) } },
    { postId: 1 }
  );
  const liked = new Set(myLikes.map(l => l.postId.toString()));
  return posts.map(p => ({
    id: p._id.toString(),
    ownerId: p.ownerId.toString(),
    ownerUsername: usernameById.get(p.ownerId.toString()) || '?',
    text: p.text,
    imageUrl: p.imageUrl,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    likedByMe: liked.has(p._id.toString()),
    createdAt: p.createdAt
  }));
}

router.get('/posts', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const filter = {};
    if (req.query.before) {
      const d = new Date(req.query.before);
      if (!Number.isNaN(d.valueOf())) filter.createdAt = { $lt: d };
    }
    const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(limit);
    const out = await decoratePosts(posts, req.user.id);
    res.json({ posts: out });
  } catch (e) { next(e); }
});

router.post('/posts', async (req, res, next) => {
  try {
    const { text = '', imageUrl = '' } = req.body || {};
    if ((!text || !text.trim()) && !imageUrl) {
      throw new AppError('VALIDATION', 'text or imageUrl required', 400);
    }
    const p = await Post.create({
      ownerId: req.user.id,
      text: text.slice(0, 4000),
      imageUrl: imageUrl.slice(0, 2048)
    });
    const [out] = await decoratePosts([p], req.user.id);
    res.json({ post: out });
  } catch (e) { next(e); }
});

router.delete('/posts/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const p = await Post.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
    if (!p) throw new AppError('NOT_FOUND', 'Not found', 404);
    await PostComment.deleteMany({ postId: p._id });
    await PostLike.deleteMany({ postId: p._id });
    res.status(204).end();
  } catch (e) { next(e); }
});

router.post('/posts/:id/like', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const p = await Post.findById(req.params.id);
    if (!p) throw new AppError('NOT_FOUND', 'Not found', 404);
    const existing = await PostLike.findOne({ postId: p._id, userId: req.user.id });
    if (existing) {
      await PostLike.deleteOne({ _id: existing._id });
      p.likeCount = Math.max(0, p.likeCount - 1);
      await p.save();
      res.json({ liked: false, likeCount: p.likeCount });
    } else {
      await PostLike.create({ postId: p._id, userId: req.user.id });
      p.likeCount += 1;
      await p.save();
      res.json({ liked: true, likeCount: p.likeCount });
    }
  } catch (e) { next(e); }
});

router.get('/posts/:id/comments', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const list = await PostComment.find({ postId: req.params.id }).sort({ createdAt: 1 });
    if (!list.length) return res.json({ comments: [] });
    const ownerIds = [...new Set(list.map(c => c.ownerId.toString()))];
    const users = await User.find({ _id: { $in: ownerIds } }, { username: 1 });
    const byId = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({
      comments: list.map(c => ({
        id: c._id.toString(),
        ownerId: c.ownerId.toString(),
        ownerUsername: byId.get(c.ownerId.toString()) || '?',
        text: c.text,
        createdAt: c.createdAt
      }))
    });
  } catch (e) { next(e); }
});

router.post('/posts/:id/comments', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      throw new AppError('VALIDATION', 'text required', 400);
    }
    const p = await Post.findById(req.params.id);
    if (!p) throw new AppError('NOT_FOUND', 'Not found', 404);
    const c = await PostComment.create({
      postId: p._id,
      ownerId: req.user.id,
      text: text.trim().slice(0, 2000)
    });
    p.commentCount += 1;
    await p.save();
    res.json({
      comment: {
        id: c._id.toString(),
        ownerId: c.ownerId.toString(),
        ownerUsername: req.user.username,
        text: c.text,
        createdAt: c.createdAt
      },
      commentCount: p.commentCount
    });
  } catch (e) { next(e); }
});

router.delete('/posts/:id/comments/:cid', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.cid)) {
      throw new AppError('NOT_FOUND', 'Not found', 404);
    }
    const c = await PostComment.findOneAndDelete({
      _id: req.params.cid,
      postId: req.params.id,
      ownerId: req.user.id
    });
    if (!c) throw new AppError('NOT_FOUND', 'Not found', 404);
    const p = await Post.findById(req.params.id);
    if (p) {
      p.commentCount = Math.max(0, p.commentCount - 1);
      await p.save();
    }
    res.status(204).end();
  } catch (e) { next(e); }
});

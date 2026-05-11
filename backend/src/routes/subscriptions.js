import express from 'express';
import mongoose from 'mongoose';
import { Subscription } from '../models/subscription.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function pub(s) {
  return {
    id: s._id.toString(),
    feedUrl: s.feedUrl,
    title: s.title,
    createdAt: s.createdAt
  };
}

router.get('/', async (req, res, next) => {
  try {
    const list = await Subscription.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
    res.json({ subscriptions: list.map(pub) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { feedUrl, title = '' } = req.body || {};
    if (typeof feedUrl !== 'string' || !/^https?:\/\//i.test(feedUrl)) {
      throw new AppError('VALIDATION', 'feedUrl http(s) required', 400);
    }
    try {
      const s = await Subscription.create({
        ownerId: req.user.id,
        feedUrl: feedUrl.trim().slice(0, 2048),
        title: title.toString().slice(0, 200)
      });
      res.json({ subscription: pub(s) });
    } catch (err) {
      if (err && err.code === 11000) {
        throw new AppError('CONFLICT', 'Already subscribed', 409);
      }
      throw err;
    }
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const s = await Subscription.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });
    if (!s) throw new AppError('NOT_FOUND', 'Not found', 404);
    res.status(204).end();
  } catch (e) { next(e); }
});

// Server-side proxy: fetch RSS/Atom feed and return raw XML to bypass CORS.
router.get('/proxy', async (req, res, next) => {
  try {
    const url = req.query.url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new AppError('VALIDATION', 'url required', 400);
    }
    const r = await fetch(url, { headers: { 'User-Agent': 'urlgram/1.0' } });
    if (!r.ok) throw new AppError('UPSTREAM', `Feed HTTP ${r.status}`, 502);
    const xml = await r.text();
    res.type('application/xml').send(xml);
  } catch (e) { next(e); }
});

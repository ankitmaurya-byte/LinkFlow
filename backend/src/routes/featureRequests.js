import express from 'express';
import { FeatureRequest } from '../models/featureRequest.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function pub(r) {
  return {
    id: r._id.toString(),
    title: r.title,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

router.get('/', async (req, res, next) => {
  try {
    const list = await FeatureRequest.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
    res.json({ requests: list.map(pub) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, description = '' } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      throw new AppError('VALIDATION', 'title required', 400);
    }
    const r = await FeatureRequest.create({
      ownerId: req.user.id,
      title: title.trim().slice(0, 200),
      description: typeof description === 'string' ? description.slice(0, 4000) : ''
    });
    res.json({ request: pub(r) });
  } catch (e) { next(e); }
});

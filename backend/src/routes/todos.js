import express from 'express';
import { TodoData } from '../models/todoData.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

const EMPTY = { projects: [], statuses: {}, tasks: {} };

router.get('/', async (req, res, next) => {
  try {
    const doc = await TodoData.findOne({ ownerId: req.user.id });
    res.json({ data: doc ? doc.data : EMPTY });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object') {
      throw new AppError('VALIDATION', 'data object required', 400);
    }
    const doc = await TodoData.findOneAndUpdate(
      { ownerId: req.user.id },
      { $set: { data } },
      { upsert: true, new: true }
    );
    res.json({ data: doc.data });
  } catch (e) { next(e); }
});

import express from 'express';
import mongoose from 'mongoose';
import { Note } from '../models/note.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
export const publicRouter = express.Router();

function publicNote(n) {
  return {
    id: n._id.toString(),
    parentNoteId: n.parentNoteId ? n.parentNoteId.toString() : null,
    title: n.title,
    icon: n.icon || '',
    blocks: n.blocks || [],
    isPublic: !!n.isPublic,
    publicSlug: n.publicSlug || null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  };
}

function newSlug() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const list = await Note.find({ ownerId: req.user.id }).sort({ updatedAt: -1 });
    res.json({ notes: list.map(publicNote) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title = 'Untitled', blocks = [], parentNoteId = null, icon = '' } = req.body || {};
    let parent = null;
    if (parentNoteId) {
      if (!mongoose.isValidObjectId(parentNoteId)) {
        throw new AppError('VALIDATION', 'invalid parentNoteId', 400);
      }
      parent = await Note.findOne({ _id: parentNoteId, ownerId: req.user.id });
      if (!parent) throw new AppError('VALIDATION', 'parent note not found', 400);
    }
    const n = await Note.create({
      ownerId: req.user.id,
      parentNoteId: parent ? parent._id : null,
      title,
      icon,
      blocks
    });
    res.json({ note: publicNote(n) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Note not found', 404);
    }
    const n = await Note.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!n) throw new AppError('NOT_FOUND', 'Note not found', 404);
    res.json({ note: publicNote(n) });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Note not found', 404);
    }
    const n = await Note.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!n) throw new AppError('NOT_FOUND', 'Note not found', 404);
    if (typeof req.body.title === 'string') n.title = req.body.title.slice(0, 200);
    if (typeof req.body.icon === 'string') n.icon = req.body.icon.slice(0, 4);
    if (Array.isArray(req.body.blocks)) n.blocks = req.body.blocks;
    if ('parentNoteId' in req.body) {
      const pid = req.body.parentNoteId;
      if (pid && !mongoose.isValidObjectId(pid)) {
        throw new AppError('VALIDATION', 'invalid parentNoteId', 400);
      }
      n.parentNoteId = pid || null;
    }
    if (typeof req.body.isPublic === 'boolean') {
      n.isPublic = req.body.isPublic;
      if (n.isPublic && !n.publicSlug) n.publicSlug = newSlug();
    }
    await n.save();
    res.json({ note: publicNote(n) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Note not found', 404);
    }
    // Cascade: collect note + descendants, delete all.
    const root = await Note.findOne({ _id: req.params.id, ownerId: req.user.id });
    if (!root) throw new AppError('NOT_FOUND', 'Note not found', 404);
    const toDelete = [root._id];
    let frontier = [root._id];
    while (frontier.length) {
      const children = await Note.find(
        { parentNoteId: { $in: frontier }, ownerId: req.user.id },
        { _id: 1 }
      );
      frontier = children.map(c => c._id);
      for (const c of children) toDelete.push(c._id);
    }
    await Note.deleteMany({ _id: { $in: toDelete }, ownerId: req.user.id });
    res.status(204).end();
  } catch (e) { next(e); }
});

// Public access — no auth.
publicRouter.get('/:slug', async (req, res, next) => {
  try {
    const n = await Note.findOne({ publicSlug: req.params.slug, isPublic: true });
    if (!n) throw new AppError('NOT_FOUND', 'Note not found', 404);
    res.json({ note: publicNote(n) });
  } catch (e) { next(e); }
});

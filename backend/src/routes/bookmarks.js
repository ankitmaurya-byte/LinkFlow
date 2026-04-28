import express from 'express';
import mongoose from 'mongoose';
import { Bookmark } from '../models/bookmark.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { wouldCreateCycle } from '../services/tree.js';

export const router = express.Router();
router.use(requireAuth);

function publicBookmark(b) {
  return {
    id: b._id.toString(),
    parentId: b.parentId ? b.parentId.toString() : null,
    tab: b.tab || 'work',
    kind: b.kind,
    name: b.name,
    url: b.url,
    platform: b.platform,
    createdAt: b.createdAt
  };
}

function parseObjectId(value, name) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError('VALIDATION', `Invalid ${name}`, 400);
  }
  return new mongoose.Types.ObjectId(value);
}

async function assertParentOwnedFolder(parentId, ownerId) {
  if (!parentId) return;
  const parent = await Bookmark.findById(parentId);
  if (!parent || parent.ownerId.toString() !== ownerId.toString()) {
    throw new AppError('VALIDATION', 'parentId not found', 400);
  }
  if (parent.kind !== 'folder') {
    throw new AppError('VALIDATION', 'parent must be a folder', 400);
  }
}

router.get('/', async (req, res, next) => {
  try {
    const filter = { ownerId: req.user.id };
    if ('parentId' in req.query) filter.parentId = parseObjectId(req.query.parentId, 'parentId');
    if (typeof req.query.tab === 'string' && req.query.tab) filter.tab = req.query.tab;
    const list = await Bookmark.find(filter).sort({ createdAt: 1 });
    res.json({ bookmarks: list.map(publicBookmark) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { kind, name, url, platform } = req.body || {};
    if (!['folder', 'link'].includes(kind)) {
      throw new AppError('VALIDATION', 'kind must be folder or link', 400);
    }
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('VALIDATION', 'name required', 400);
    }
    if (kind === 'link' && (typeof url !== 'string' || !url.trim())) {
      throw new AppError('VALIDATION', 'url required for link', 400);
    }
    const parentId = parseObjectId(req.body.parentId, 'parentId');
    await assertParentOwnedFolder(parentId, req.user.id);
    const tab = (typeof req.body.tab === 'string' && req.body.tab.trim()) ? req.body.tab.trim() : 'work';
    const created = await Bookmark.create({
      ownerId: req.user.id,
      parentId,
      tab,
      kind,
      name: name.trim(),
      url: kind === 'link' ? url : null,
      platform: kind === 'link' ? platform || null : null
    });
    res.json({ bookmark: publicBookmark(created) });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const bm = await Bookmark.findOne({ _id: id, ownerId: req.user.id });
    if (!bm) throw new AppError('NOT_FOUND', 'Bookmark not found', 404);

    if ('parentId' in req.body) {
      const newParent = parseObjectId(req.body.parentId, 'parentId');
      await assertParentOwnedFolder(newParent, req.user.id);
      const ancestors = [];
      let cursor = newParent;
      while (cursor) {
        const parent = await Bookmark.findOne({ _id: cursor, ownerId: req.user.id }, { parentId: 1 });
        if (!parent) break;
        ancestors.push(parent);
        cursor = parent.parentId;
      }
      const lookup = (cid) => ancestors.find(n => n._id.toString() === cid?.toString());
      if (wouldCreateCycle(bm._id, newParent, lookup) || (newParent && newParent.toString() === bm._id.toString())) {
        throw new AppError('VALIDATION', 'parentId would create cycle', 400);
      }
      bm.parentId = newParent;
    }
    if (typeof req.body.name === 'string' && req.body.name.trim()) bm.name = req.body.name.trim();
    if (typeof req.body.tab === 'string' && req.body.tab.trim()) bm.tab = req.body.tab.trim();
    if (bm.kind === 'link') {
      if (typeof req.body.url === 'string') bm.url = req.body.url;
      if (typeof req.body.platform === 'string') bm.platform = req.body.platform;
    }
    await bm.save();
    res.json({ bookmark: publicBookmark(bm) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const bm = await Bookmark.findOne({ _id: id, ownerId: req.user.id });
    if (!bm) throw new AppError('NOT_FOUND', 'Bookmark not found', 404);
    const toDelete = [bm._id.toString()];
    let frontier = [bm._id];
    while (frontier.length) {
      const children = await Bookmark.find({ parentId: { $in: frontier }, ownerId: req.user.id }, { _id: 1 });
      frontier = children.map(c => c._id);
      for (const c of children) toDelete.push(c._id.toString());
    }
    await Bookmark.deleteMany({ _id: { $in: toDelete }, ownerId: req.user.id });
    res.status(204).end();
  } catch (e) { next(e); }
});

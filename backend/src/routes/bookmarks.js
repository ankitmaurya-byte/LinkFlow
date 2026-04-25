import express from 'express';
import mongoose from 'mongoose';
import { Bookmark } from '../models/bookmark.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function publicBookmark(b) {
  return {
    id: b._id.toString(),
    parentId: b.parentId ? b.parentId.toString() : null,
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
    const parentId = parseObjectId(req.query.parentId, 'parentId');
    const list = await Bookmark.find({ ownerId: req.user.id, parentId }).sort({ createdAt: 1 });
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
    const created = await Bookmark.create({
      ownerId: req.user.id,
      parentId,
      kind,
      name: name.trim(),
      url: kind === 'link' ? url : null,
      platform: kind === 'link' ? platform || null : null
    });
    res.json({ bookmark: publicBookmark(created) });
  } catch (e) { next(e); }
});

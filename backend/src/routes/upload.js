import express from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

router.post('/sign', (req, res, next) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = process.env.CLOUDINARY_FOLDER || '';
    if (!cloudName || !apiKey || !apiSecret) {
      throw new AppError('CONFIG', 'Cloudinary env vars missing', 500);
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = folder
      ? `folder=${folder}&timestamp=${timestamp}`
      : `timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + apiSecret)
      .digest('hex');
    res.json({
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature
    });
  } catch (e) { next(e); }
});

import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bookmark', default: null, index: true },
  tab: { type: String, default: 'work', index: true, maxlength: 32 },
  kind: { type: String, enum: ['folder', 'link'], required: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  url: { type: String, default: null, maxlength: 4096 },
  platform: { type: String, default: null, maxlength: 64 }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.pre('validate', function (next) {
  if (this.kind === 'link' && !this.url) return next(new Error('link must have url'));
  if (this.kind === 'folder' && this.url) return next(new Error('folder must not have url'));
  next();
});

export const Bookmark = mongoose.models.Bookmark || mongoose.model('Bookmark', schema);

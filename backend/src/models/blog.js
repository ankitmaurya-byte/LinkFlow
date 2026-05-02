import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 280 },
  body: { type: String, default: '', maxlength: 100000 },
  coverImage: { type: String, default: '' },
  isPublic: { type: Boolean, default: false },
  slug: { type: String, index: { unique: true, sparse: true } }
}, { timestamps: true });

schema.index({ isPublic: 1, createdAt: -1 });

export const Blog = mongoose.models.Blog || mongoose.model('Blog', schema);

import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, default: '', maxlength: 4000 },
  imageUrl: { type: String, default: '' },
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 }
}, { timestamps: true });

schema.index({ createdAt: -1 });

export const Post = mongoose.models.Post || mongoose.model('Post', schema);

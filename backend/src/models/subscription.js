import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  feedUrl: { type: String, required: true, maxlength: 2048 },
  title: { type: String, default: '' }
}, { timestamps: true });

schema.index({ ownerId: 1, feedUrl: 1 }, { unique: true });

export const Subscription = mongoose.models.Subscription ||
  mongoose.model('Subscription', schema);

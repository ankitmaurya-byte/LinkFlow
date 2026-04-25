import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  // userA = lower of the two ObjectId hex strings; userB = higher.
  // requesterId is the original side that initiated; status 'pending' or 'accepted'.
  userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted'], required: true, default: 'pending' }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ userA: 1, userB: 1 }, { unique: true });

schema.statics.normalizePair = function (a, b) {
  const A = a.toString();
  const B = b.toString();
  return A < B ? { userA: a, userB: b } : { userA: b, userB: a };
};

export const Friendship = mongoose.models.Friendship || mongoose.model('Friendship', schema);

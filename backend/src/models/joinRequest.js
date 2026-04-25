import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], required: true, default: 'pending' }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ groupId: 1, userId: 1, status: 1 });

export const JoinRequest = mongoose.models.JoinRequest || mongoose.model('JoinRequest', schema);

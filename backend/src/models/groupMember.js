import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['admin', 'member'], required: true, default: 'member' }
}, { timestamps: { createdAt: 'joinedAt', updatedAt: false } });

schema.index({ groupId: 1, userId: 1 }, { unique: true });

export const GroupMember = mongoose.models.GroupMember || mongoose.model('GroupMember', schema);

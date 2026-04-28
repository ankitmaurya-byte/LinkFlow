import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  parentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inviteCode: { type: String, unique: true, sparse: true, index: true, maxlength: 16 }
}, { timestamps: { createdAt: true, updatedAt: false } });

// NOTE: cycle prevention on `parentGroupId` is deferred — Spec A has no
// group reparent/move endpoint, so cycles can only be planted via direct DB
// writes. Spec B/C should add a `pre('validate')` hook walking ancestors via
// `Group.findById(parentGroupId)` when a move endpoint is introduced.

export const Group = mongoose.models.Group || mongoose.model('Group', schema);

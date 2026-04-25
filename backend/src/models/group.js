import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  parentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const Group = mongoose.models.Group || mongoose.model('Group', schema);

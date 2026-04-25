import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  parentFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupFolder', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const GroupFolder = mongoose.models.GroupFolder || mongoose.model('GroupFolder', schema);

import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['url'], required: true, default: 'url' },
  url: { type: String, required: true, maxlength: 4096 },
  title: { type: String, default: null, maxlength: 400 },
  platform: { type: String, default: null, maxlength: 64 }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ groupId: 1, createdAt: -1 });

export const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', schema);

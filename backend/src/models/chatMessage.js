import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['url', 'text', 'folder', 'bookmark', 'todo'], required: true, default: 'text' },
  url: { type: String, default: null, maxlength: 4096 },
  text: { type: String, default: null, maxlength: 4000 },
  title: { type: String, default: null, maxlength: 400 },
  platform: { type: String, default: null, maxlength: 64 },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  replyToId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  mentions: { type: [String], default: [] },
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ groupId: 1, createdAt: -1 });

export const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', schema);

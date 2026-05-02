import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, default: 'paragraph' },
  text: { type: String, default: '' },
  checked: { type: Boolean, default: false },
  src: { type: String, default: '' },
  language: { type: String, default: '' },
  // Generic payload for structured blocks (tables, page-link, etc).
  payload: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

const noteSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentNoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', default: null, index: true },
  title: { type: String, default: 'Untitled', maxlength: 200 },
  icon: { type: String, default: '' },
  blocks: { type: [blockSchema], default: [] },
  isPublic: { type: Boolean, default: false },
  publicSlug: { type: String, index: { unique: true, sparse: true } }
}, { timestamps: true });

export const Note = mongoose.models.Note || mongoose.model('Note', noteSchema);

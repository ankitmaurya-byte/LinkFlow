import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: () => ({ projects: [], statuses: {}, tasks: {} }) }
}, { timestamps: true });

export const TodoData = mongoose.models.TodoData || mongoose.model('TodoData', schema);

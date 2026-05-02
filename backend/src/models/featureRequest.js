import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 200 },
  description: { type: String, default: '', maxlength: 4000 },
  status: {
    type: String,
    enum: ['pending', 'planned', 'in-progress', 'done', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

export const FeatureRequest = mongoose.models.FeatureRequest ||
  mongoose.model('FeatureRequest', schema);

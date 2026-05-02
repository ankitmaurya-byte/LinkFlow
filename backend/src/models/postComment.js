import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 2000 }
}, { timestamps: true });

export const PostComment = mongoose.models.PostComment ||
  mongoose.model('PostComment', schema);

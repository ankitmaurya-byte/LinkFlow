import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 32,
    match: /^[a-z0-9_-]+$/
  },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const User = mongoose.models.User || mongoose.model('User', userSchema);

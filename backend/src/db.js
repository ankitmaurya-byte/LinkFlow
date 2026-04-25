import mongoose from 'mongoose';

export async function connectDb(url) {
  await mongoose.connect(url);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';

let mongod;

export async function startTestApp() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  return createApp();
}

export async function stopTestApp() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

export async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
}

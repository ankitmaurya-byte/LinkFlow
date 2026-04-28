import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config, validateConfig } from '../src/config.js';

let appPromise = null;

async function getApp() {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    validateConfig();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUrl);
    }
    return createApp();
  })();
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}

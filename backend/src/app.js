import express from 'express';
import { errorHandler, notFound } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // routes mounted here in later tasks

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

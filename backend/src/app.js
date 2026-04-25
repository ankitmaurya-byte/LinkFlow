import express from 'express';
import { errorHandler, notFound } from './middleware/error.js';
import { router as authRouter, meRouter } from './routes/auth.js';
import { router as bookmarksRouter } from './routes/bookmarks.js';
import { router as friendsRouter } from './routes/friends.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use(meRouter);
  app.use('/bookmarks', bookmarksRouter);
  app.use('/friends', friendsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

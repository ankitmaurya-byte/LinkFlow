import express from 'express';
import { errorHandler, notFound } from './middleware/error.js';
import { corsMiddleware } from './middleware/cors.js';
import { router as authRouter, meRouter } from './routes/auth.js';
import { router as bookmarksRouter } from './routes/bookmarks.js';
import { router as friendsRouter, userBookmarksRouter } from './routes/friends.js';
import { router as groupsRouter } from './routes/groups.js';
import { router as chatRouter } from './routes/chat.js';

export function createApp() {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use(meRouter);
  app.use('/bookmarks', bookmarksRouter);
  app.use('/friends', friendsRouter);
  app.use(userBookmarksRouter);
  app.use('/groups', groupsRouter);
  app.use('/groups/:id/chat', chatRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

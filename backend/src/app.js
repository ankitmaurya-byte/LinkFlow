import express from 'express';
import { errorHandler, notFound } from './middleware/error.js';
import { corsMiddleware } from './middleware/cors.js';
import { router as authRouter, meRouter } from './routes/auth.js';
import { router as bookmarksRouter } from './routes/bookmarks.js';
import { router as friendsRouter, userBookmarksRouter } from './routes/friends.js';
import { router as groupsRouter } from './routes/groups.js';
import { router as chatRouter } from './routes/chat.js';
import { router as todosRouter } from './routes/todos.js';
import { router as shareRouter } from './routes/share.js';
import { router as notesRouter, publicRouter as notesPublicRouter } from './routes/notes.js';
import { router as uploadRouter } from './routes/upload.js';
import { router as featureRequestsRouter } from './routes/featureRequests.js';
import { router as feedRouter } from './routes/feed.js';
import { router as blogsRouter, publicRouter as blogsPublicRouter } from './routes/blogs.js';
import { router as subsRouter } from './routes/subscriptions.js';

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
  app.use('/todos', todosRouter);
  app.use('/share', shareRouter);
  app.use('/notes', notesRouter);
  app.use('/public/notes', notesPublicRouter);
  app.use('/upload', uploadRouter);
  app.use('/feature-requests', featureRequestsRouter);
  app.use('/feed', feedRouter);
  app.use('/blogs', blogsRouter);
  app.use('/public/blogs', blogsPublicRouter);
  app.use('/subscriptions', subsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

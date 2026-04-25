# LinkFlow Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node + Express + MongoDB HTTP API providing auth, personal bookmark trees, friends, nested groups with admin-controlled folders, and chat URL-share history — verified end-to-end by Vitest + Supertest with an in-memory Mongo.

**Architecture:** A single Express service connects to MongoDB through Mongoose. Stateless JWT bearer auth with server-stored, rotating refresh tokens. Each route file owns one resource (auth, bookmarks, friends, groups, chat). Cross-cutting concerns (auth/authz, error format, validation, tree cycle checks, password and token services) live in dedicated middleware/service modules. All endpoints are integration-tested against a real Mongo instance via `mongodb-memory-server`.

**Tech Stack:** Node 20+, Express 4, Mongoose 8, bcrypt, jsonwebtoken (HS256), Vitest, Supertest, mongodb-memory-server, dotenv, express-rate-limit, Docker Compose (local dev Mongo).

---

## File Structure

```
backend/
  package.json
  vitest.config.js
  .env.example
  .gitignore
  docker-compose.yml
  README.md
  src/
    server.js                     # express bootstrap; mounts routes; starts listener
    app.js                        # express app factory (used by server + tests)
    db.js                         # mongoose connect/disconnect
    config.js                     # reads + validates env
    middleware/
      auth.js                     # requireAuth, requireFriendOf, requireGroupMember, requireGroupAdmin
      error.js                    # central error handler + AppError class
      validate.js                 # body validation helper
      rateLimit.js                # auth rate limit
    models/
      user.js
      refreshToken.js
      bookmark.js
      friendship.js
      group.js
      groupMember.js
      joinRequest.js
      groupFolder.js
      chatMessage.js
    routes/
      auth.js
      bookmarks.js
      friends.js
      groups.js
      chat.js
    services/
      passwords.js                # bcrypt hash/compare
      tokens.js                   # jwt sign/verify, refresh issue/rotate/revoke
      tree.js                     # ancestor walk + cycle prevention (bookmarks + groups)
  tests/
    helpers.js                    # in-memory mongo bootstrap + supertest app + signupUser helper
    auth.test.js
    bookmarks.test.js
    friends.test.js
    groups.test.js
    groupFolders.test.js
    chat.test.js
    tree.test.js
```

Working directory for all tasks: `/home/ankit/Public/codes/extension/bookmark/backend`.

Run all tests from this directory with `npm test`.

---

## Task 1: Project bootstrap

**Files:**
- Create: `backend/package.json`
- Create: `backend/.gitignore`
- Create: `backend/.env.example`
- Create: `backend/vitest.config.js`
- Create: `backend/docker-compose.yml`
- Create: `backend/README.md`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "linkflow-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.6.0"
  },
  "devDependencies": {
    "mongodb-memory-server": "^10.0.0",
    "supertest": "^7.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `backend/.gitignore`**

```
node_modules
.env
coverage
*.log
.DS_Store
```

- [ ] **Step 3: Create `backend/.env.example`**

```
PORT=4000
MONGO_URL=mongodb://localhost:27017/linkflow
JWT_SECRET=change-me-to-a-32-plus-char-secret-string
JWT_ACCESS_TTL_SECONDS=900
REFRESH_TTL_DAYS=30
CORS_ORIGINS=moz-extension://*,chrome-extension://*
NODE_ENV=development
```

- [ ] **Step 4: Create `backend/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }
  }
});
```

- [ ] **Step 5: Create `backend/docker-compose.yml`**

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
volumes:
  mongo_data:
```

- [ ] **Step 6: Create `backend/README.md`**

```md
# LinkFlow Backend

Node + Express + MongoDB API for the LinkFlow extension.

## Local dev

1. `cp .env.example .env`
2. `docker compose up -d` (starts Mongo on 27017)
3. `npm install`
4. `npm run dev`

## Tests

`npm test`
```

- [ ] **Step 7: Install dependencies**

Run: `cd backend && npm install`
Expected: installs without errors; `node_modules` populated.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.gitignore backend/.env.example backend/vitest.config.js backend/docker-compose.yml backend/README.md
git commit -m "chore(backend): bootstrap project (package, vitest, docker compose)"
```

---

## Task 2: App factory + config + db + central error handler

**Files:**
- Create: `backend/src/config.js`
- Create: `backend/src/db.js`
- Create: `backend/src/middleware/error.js`
- Create: `backend/src/app.js`
- Create: `backend/src/server.js`
- Create: `backend/tests/helpers.js`
- Create: `backend/tests/health.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/health.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, stopTestApp } from './helpers.js';
import request from 'supertest';

let app;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await stopTestApp(); });

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('unknown route returns 404 with error envelope', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- health`
Expected: FAIL — `helpers.js` does not exist.

- [ ] **Step 3: Create `backend/src/config.js`**

```js
import 'dotenv/config';

const required = ['JWT_SECRET'];

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/linkflow',
  jwtSecret: process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-32',
  jwtAccessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS || '900', 10),
  refreshTtlDays: parseInt(process.env.REFRESH_TTL_DAYS || '30', 10),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()),
  nodeEnv: process.env.NODE_ENV || 'development'
};

export function validateConfig() {
  for (const key of required) {
    if (!process.env[key] && config.nodeEnv === 'production') {
      throw new Error(`Missing required env: ${key}`);
    }
  }
  if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}
```

- [ ] **Step 4: Create `backend/src/db.js`**

```js
import mongoose from 'mongoose';

export async function connectDb(url) {
  await mongoose.connect(url);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
```

- [ ] **Step 5: Create `backend/src/middleware/error.js`**

```js
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function notFound(_req, _res, next) {
  next(new AppError('NOT_FOUND', 'Route not found', 404));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Duplicate value' } });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
}
```

- [ ] **Step 6: Create `backend/src/app.js`**

```js
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
```

- [ ] **Step 7: Create `backend/src/server.js`**

```js
import { createApp } from './app.js';
import { connectDb } from './db.js';
import { config, validateConfig } from './config.js';

async function main() {
  validateConfig();
  await connectDb(config.mongoUrl);
  const app = createApp();
  app.listen(config.port, () => {
    console.log(JSON.stringify({ msg: 'listening', port: config.port }));
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 8: Create `backend/tests/helpers.js`**

```js
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
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && npm test -- health`
Expected: PASS — `health > GET /health returns ok` and `health > unknown route returns 404`.

- [ ] **Step 10: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat(backend): app factory, config, db, error handler"
```

---

## Task 3: User model

**Files:**
- Create: `backend/src/models/user.js`
- Create: `backend/tests/user-model.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/user-model.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, stopTestApp, resetDb } from './helpers.js';
import { User } from '../src/models/user.js';

beforeAll(async () => { await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

describe('User model', () => {
  it('creates a user with lowercased username', async () => {
    const u = await User.create({ username: 'Alice', passwordHash: 'x' });
    expect(u.username).toBe('alice');
  });

  it('rejects duplicate username', async () => {
    await User.create({ username: 'bob', passwordHash: 'x' });
    await expect(User.create({ username: 'bob', passwordHash: 'y' })).rejects.toThrow();
  });

  it('rejects username outside [a-z0-9_-] or wrong length', async () => {
    await expect(User.create({ username: 'ab', passwordHash: 'x' })).rejects.toThrow();
    await expect(User.create({ username: 'has space', passwordHash: 'x' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- user-model`
Expected: FAIL — model module not found.

- [ ] **Step 3: Create `backend/src/models/user.js`**

```js
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
  passwordHash: { type: String, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const User = mongoose.model('User', userSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- user-model`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/user.js backend/tests/user-model.test.js
git commit -m "feat(backend): user model with username validation"
```

---

## Task 4: Password service

**Files:**
- Create: `backend/src/services/passwords.js`
- Create: `backend/tests/passwords.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/passwords.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/passwords.js';

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('hunter2hunter2');
    expect(hash).not.toBe('hunter2hunter2');
    expect(await verifyPassword('hunter2hunter2', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- passwords`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `backend/src/services/passwords.js`**

```js
import bcrypt from 'bcrypt';

const ROUNDS = 12;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- passwords`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/passwords.js backend/tests/passwords.test.js
git commit -m "feat(backend): bcrypt password service"
```

---

## Task 5: Refresh token model + token service

**Files:**
- Create: `backend/src/models/refreshToken.js`
- Create: `backend/src/services/tokens.js`
- Create: `backend/tests/tokens.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/tokens.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, stopTestApp, resetDb } from './helpers.js';
import mongoose from 'mongoose';
import { signAccess, verifyAccess, issueRefresh, rotateRefresh, revokeRefresh } from '../src/services/tokens.js';

beforeAll(async () => { await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

const userId = () => new mongoose.Types.ObjectId();

describe('tokens', () => {
  it('signs and verifies access token', () => {
    const id = userId();
    const token = signAccess({ userId: id, username: 'alice' });
    const payload = verifyAccess(token);
    expect(payload.sub).toBe(id.toString());
    expect(payload.username).toBe('alice');
  });

  it('rejects tampered token', () => {
    const t = signAccess({ userId: userId(), username: 'a' });
    expect(() => verifyAccess(t + 'x')).toThrow();
  });

  it('issues a refresh token and validates it', async () => {
    const id = userId();
    const { token, record } = await issueRefresh(id);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(record.userId.toString()).toBe(id.toString());
  });

  it('rotates a refresh token (old revoked, new issued)', async () => {
    const id = userId();
    const a = await issueRefresh(id);
    const b = await rotateRefresh(a.token);
    expect(b.token).not.toBe(a.token);
    await expect(rotateRefresh(a.token)).rejects.toThrow();
  });

  it('revokes a refresh token', async () => {
    const id = userId();
    const a = await issueRefresh(id);
    await revokeRefresh(a.token);
    await expect(rotateRefresh(a.token)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tokens`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `backend/src/models/refreshToken.js`**

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const RefreshToken = mongoose.model('RefreshToken', schema);
```

- [ ] **Step 4: Create `backend/src/services/tokens.js`**

```js
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { RefreshToken } from '../models/refreshToken.js';
import { AppError } from '../middleware/error.js';

export function signAccess({ userId, username }) {
  return jwt.sign(
    { sub: userId.toString(), username },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.jwtAccessTtlSeconds }
  );
}

export function verifyAccess(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefresh(userId) {
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 86400 * 1000);
  const record = await RefreshToken.create({ userId, tokenHash: hash(token), expiresAt });
  return { token, record };
}

export async function rotateRefresh(presentedToken) {
  const tokenHash = hash(presentedToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError('AUTH_INVALID', 'Refresh token invalid', 401);
  }
  record.revokedAt = new Date();
  await record.save();
  return issueRefresh(record.userId);
}

export async function revokeRefresh(presentedToken) {
  const tokenHash = hash(presentedToken);
  await RefreshToken.updateOne({ tokenHash }, { $set: { revokedAt: new Date() } });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- tokens`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/refreshToken.js backend/src/services/tokens.js backend/tests/tokens.test.js
git commit -m "feat(backend): jwt access + rotating refresh token service"
```

---

## Task 6: requireAuth middleware

**Files:**
- Create: `backend/src/middleware/auth.js` (initial — only `requireAuth`)

- [ ] **Step 1: Create `backend/src/middleware/auth.js`**

```js
import { verifyAccess } from '../services/tokens.js';
import { AppError } from './error.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) return next(new AppError('AUTH_INVALID', 'Missing bearer token', 401));
  try {
    const payload = verifyAccess(match[1]);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (e) {
    if (e?.name === 'TokenExpiredError') {
      return next(new AppError('AUTH_EXPIRED', 'Access token expired', 401));
    }
    next(new AppError('AUTH_INVALID', 'Invalid token', 401));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/auth.js
git commit -m "feat(backend): requireAuth middleware"
```

(Tested indirectly by Task 7+ tests.)

---

## Task 7: Auth signup + login + me

**Files:**
- Create: `backend/src/routes/auth.js`
- Modify: `backend/src/app.js` (mount `/auth` and `/me`)
- Create/extend: `backend/tests/auth.test.js`
- Create: `backend/tests/helpers.js` — extend with `signupUser`

- [ ] **Step 1: Extend `backend/tests/helpers.js`** — append:

```js
import request from 'supertest';

export async function signupUser(app, username = 'alice', password = 'hunter2hunter2') {
  const res = await request(app).post('/auth/signup').send({ username, password });
  return res.body;
}
```

- [ ] **Step 2: Write the failing test `backend/tests/auth.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, resetDb, signupUser } from './helpers.js';

let app;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

describe('auth', () => {
  it('signs up + returns tokens', async () => {
    const res = await request(app).post('/auth/signup').send({ username: 'alice', password: 'hunter2hunter2' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.username).toBe('alice');
  });

  it('rejects duplicate username', async () => {
    await signupUser(app, 'alice');
    const res = await request(app).post('/auth/signup').send({ username: 'alice', password: 'hunter2hunter2' });
    expect(res.status).toBe(409);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/auth/signup').send({ username: 'alice', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('logs in valid creds', async () => {
    await signupUser(app, 'alice');
    const res = await request(app).post('/auth/login').send({ username: 'alice', password: 'hunter2hunter2' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects bad password', async () => {
    await signupUser(app, 'alice');
    const res = await request(app).post('/auth/login').send({ username: 'alice', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('GET /me requires auth', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
  });

  it('GET /me returns profile when authed', async () => {
    const { accessToken } = await signupUser(app, 'alice');
    const res = await request(app).get('/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test -- auth`
Expected: FAIL — `/auth/signup` returns 404.

- [ ] **Step 4: Create `backend/src/routes/auth.js`**

```js
import express from 'express';
import { User } from '../models/user.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { signAccess, issueRefresh } from '../services/tokens.js';
import { AppError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

export const router = express.Router();

function publicUser(u) {
  return { id: u._id.toString(), username: u.username, createdAt: u.createdAt };
}

function validateCreds(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new AppError('VALIDATION', 'username and password required', 400);
  }
  if (password.length < 8) {
    throw new AppError('VALIDATION', 'password must be at least 8 characters', 400);
  }
}

router.post('/signup', async (req, res, next) => {
  try {
    validateCreds(req.body);
    const passwordHash = await hashPassword(req.body.password);
    const user = await User.create({ username: req.body.username, passwordHash });
    const accessToken = signAccess({ userId: user._id, username: user.username });
    const { token: refreshToken } = await issueRefresh(user._id);
    res.json({ accessToken, refreshToken, user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    validateCreds(req.body);
    const user = await User.findOne({ username: req.body.username.toLowerCase() });
    if (!user) throw new AppError('AUTH_INVALID', 'Invalid credentials', 401);
    const ok = await verifyPassword(req.body.password, user.passwordHash);
    if (!ok) throw new AppError('AUTH_INVALID', 'Invalid credentials', 401);
    const accessToken = signAccess({ userId: user._id, username: user.username });
    const { token: refreshToken } = await issueRefresh(user._id);
    res.json({ accessToken, refreshToken, user: publicUser(user) });
  } catch (e) { next(e); }
});

export const meRouter = express.Router();

meRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Modify `backend/src/app.js` — mount routers**

Replace the `// routes mounted here in later tasks` comment with:

```js
import { router as authRouter, meRouter } from './routes/auth.js';
// ... inside createApp(), before app.use(notFound):
app.use('/auth', authRouter);
app.use(meRouter);
```

Final `app.js`:

```js
import express from 'express';
import { errorHandler, notFound } from './middleware/error.js';
import { router as authRouter, meRouter } from './routes/auth.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use(meRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test -- auth`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.js backend/src/app.js backend/tests/auth.test.js backend/tests/helpers.js
git commit -m "feat(backend): auth signup/login + /me"
```

---

## Task 8: Auth refresh + logout

**Files:**
- Modify: `backend/src/routes/auth.js`
- Modify: `backend/tests/auth.test.js`

- [ ] **Step 1: Extend `backend/tests/auth.test.js`** — append inside `describe('auth', ...)`:

```js
  it('refreshes tokens (rotate) and old refresh becomes invalid', async () => {
    const { refreshToken } = await signupUser(app, 'alice');
    const r1 = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(refreshToken);
    const r2 = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(r2.status).toBe(401);
  });

  it('logout revokes refresh token', async () => {
    const { refreshToken } = await signupUser(app, 'alice');
    const out = await request(app).post('/auth/logout').send({ refreshToken });
    expect(out.status).toBe(204);
    const r = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(r.status).toBe(401);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- auth`
Expected: FAIL — `/auth/refresh` and `/auth/logout` return 404.

- [ ] **Step 3: Modify `backend/src/routes/auth.js`** — add at top of file imports:

```js
import { rotateRefresh, revokeRefresh } from '../services/tokens.js';
import { User as _User } from '../models/user.js';
```

(`User` already imported; the second import is illustrative — don't double-import. Just ensure `rotateRefresh, revokeRefresh` are imported alongside `signAccess, issueRefresh`.)

Append to `router`:

```js
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string') {
      throw new AppError('VALIDATION', 'refreshToken required', 400);
    }
    const next_ = await rotateRefresh(refreshToken);
    const user = await User.findById(next_.record.userId);
    if (!user) throw new AppError('AUTH_INVALID', 'User missing', 401);
    const accessToken = signAccess({ userId: user._id, username: user.username });
    res.json({ accessToken, refreshToken: next_.token });
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken === 'string') await revokeRefresh(refreshToken);
    res.status(204).end();
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- auth`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.js backend/tests/auth.test.js
git commit -m "feat(backend): auth refresh + logout"
```

---

## Task 9: Rate limit on auth routes

**Files:**
- Create: `backend/src/middleware/rateLimit.js`
- Modify: `backend/src/routes/auth.js`

- [ ] **Step 1: Create `backend/src/middleware/rateLimit.js`**

```js
import rateLimit from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});
```

- [ ] **Step 2: Modify `backend/src/routes/auth.js`** — at top, add:

```js
import { authRateLimit } from '../middleware/rateLimit.js';
```

Apply on the auth router. Above `router.post('/signup', ...)` add:

```js
router.use(authRateLimit);
```

(One middleware mounted on the auth router covers signup, login, refresh, logout.)

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `cd backend && npm test`
Expected: PASS — auth tests still green (none exceed 10/min in a single test).

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/rateLimit.js backend/src/routes/auth.js
git commit -m "feat(backend): rate limit auth endpoints (10/min/IP)"
```

---

## Task 10: Tree service (cycle prevention)

**Files:**
- Create: `backend/src/services/tree.js`
- Create: `backend/tests/tree.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/tree.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from '../src/services/tree.js';

function fakeNode(id, parentId) { return { _id: id, parentId }; }

describe('tree.wouldCreateCycle', () => {
  it('returns false when no cycle', () => {
    const nodes = [fakeNode('a', null), fakeNode('b', 'a'), fakeNode('c', 'b')];
    const findParent = (id) => nodes.find(n => n._id === id);
    expect(wouldCreateCycle('c', 'a', findParent)).toBe(false);
  });

  it('returns true when target is descendant', () => {
    const nodes = [fakeNode('a', null), fakeNode('b', 'a'), fakeNode('c', 'b')];
    const findParent = (id) => nodes.find(n => n._id === id);
    expect(wouldCreateCycle('a', 'c', findParent)).toBe(true);
  });

  it('returns true when target equals self', () => {
    const findParent = () => null;
    expect(wouldCreateCycle('a', 'a', findParent)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tree`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `backend/src/services/tree.js`**

```js
// wouldCreateCycle: returns true if reparenting `nodeId` under `newParentId` would create a cycle.
// findParentNode(id) -> { _id, parentId } | null
export function wouldCreateCycle(nodeId, newParentId, findParentNode) {
  if (!newParentId) return false;
  const seen = new Set();
  let cursor = newParentId?.toString();
  const target = nodeId?.toString();
  while (cursor) {
    if (cursor === target) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const node = findParentNode(cursor);
    cursor = node?.parentId ? node.parentId.toString() : null;
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tree`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/tree.js backend/tests/tree.test.js
git commit -m "feat(backend): tree cycle-prevention helper"
```

---

## Task 11: Bookmark model

**Files:**
- Create: `backend/src/models/bookmark.js`

- [ ] **Step 1: Create `backend/src/models/bookmark.js`**

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bookmark', default: null, index: true },
  kind: { type: String, enum: ['folder', 'link'], required: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  url: { type: String, default: null, maxlength: 4096 },
  platform: { type: String, default: null, maxlength: 64 }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.pre('validate', function (next) {
  if (this.kind === 'link' && !this.url) return next(new Error('link must have url'));
  if (this.kind === 'folder' && this.url) return next(new Error('folder must not have url'));
  next();
});

export const Bookmark = mongoose.model('Bookmark', schema);
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/models/bookmark.js
git commit -m "feat(backend): bookmark model with folder/link discriminator"
```

(Tested via route tests in Task 12.)

---

## Task 12: Bookmarks GET + POST

**Files:**
- Create: `backend/src/routes/bookmarks.js`
- Modify: `backend/src/app.js`
- Create: `backend/tests/bookmarks.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/bookmarks.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, resetDb, signupUser } from './helpers.js';

let app;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

async function authedAlice() {
  const { accessToken } = await signupUser(app, 'alice');
  return (req) => req.set('Authorization', `Bearer ${accessToken}`);
}

describe('bookmarks GET/POST', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/bookmarks');
    expect(res.status).toBe(401);
  });

  it('creates a folder at root', async () => {
    const auth = await authedAlice();
    const res = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'Work' }));
    expect(res.status).toBe(200);
    expect(res.body.bookmark.kind).toBe('folder');
    expect(res.body.bookmark.parentId).toBeNull();
  });

  it('creates a link inside a folder', async () => {
    const auth = await authedAlice();
    const folder = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'Work' }));
    const res = await auth(request(app).post('/bookmarks').send({
      parentId: folder.body.bookmark.id, kind: 'link', name: 'GitHub', url: 'https://github.com', platform: 'web'
    }));
    expect(res.status).toBe(200);
    expect(res.body.bookmark.url).toBe('https://github.com');
  });

  it('rejects link without url', async () => {
    const auth = await authedAlice();
    const res = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'link', name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('rejects parentId belonging to another user', async () => {
    const aliceAuth = await authedAlice();
    const aliceFolder = await aliceAuth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'A' }));
    const { accessToken: bobToken } = await signupUser(app, 'bob');
    const res = await request(app).post('/bookmarks')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ parentId: aliceFolder.body.bookmark.id, kind: 'link', name: 'X', url: 'https://x.test' });
    expect(res.status).toBe(400);
  });

  it('lists root and lists by parentId', async () => {
    const auth = await authedAlice();
    const folder = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'F' }));
    await auth(request(app).post('/bookmarks').send({
      parentId: folder.body.bookmark.id, kind: 'link', name: 'L', url: 'https://l.test'
    }));
    const root = await auth(request(app).get('/bookmarks'));
    expect(root.status).toBe(200);
    expect(root.body.bookmarks).toHaveLength(1);
    const inside = await auth(request(app).get(`/bookmarks?parentId=${folder.body.bookmark.id}`));
    expect(inside.body.bookmarks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- bookmarks`
Expected: FAIL — `/bookmarks` 404.

- [ ] **Step 3: Create `backend/src/routes/bookmarks.js`**

```js
import express from 'express';
import mongoose from 'mongoose';
import { Bookmark } from '../models/bookmark.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function publicBookmark(b) {
  return {
    id: b._id.toString(),
    parentId: b.parentId ? b.parentId.toString() : null,
    kind: b.kind,
    name: b.name,
    url: b.url,
    platform: b.platform,
    createdAt: b.createdAt
  };
}

function parseObjectId(value, name) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError('VALIDATION', `Invalid ${name}`, 400);
  }
  return new mongoose.Types.ObjectId(value);
}

async function assertParentOwnedFolder(parentId, ownerId) {
  if (!parentId) return;
  const parent = await Bookmark.findById(parentId);
  if (!parent || parent.ownerId.toString() !== ownerId.toString()) {
    throw new AppError('VALIDATION', 'parentId not found', 400);
  }
  if (parent.kind !== 'folder') {
    throw new AppError('VALIDATION', 'parent must be a folder', 400);
  }
}

router.get('/', async (req, res, next) => {
  try {
    const parentId = parseObjectId(req.query.parentId, 'parentId');
    const list = await Bookmark.find({ ownerId: req.user.id, parentId }).sort({ createdAt: 1 });
    res.json({ bookmarks: list.map(publicBookmark) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { kind, name, url, platform } = req.body || {};
    if (!['folder', 'link'].includes(kind)) {
      throw new AppError('VALIDATION', 'kind must be folder or link', 400);
    }
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('VALIDATION', 'name required', 400);
    }
    const parentId = parseObjectId(req.body.parentId, 'parentId');
    await assertParentOwnedFolder(parentId, req.user.id);
    const created = await Bookmark.create({
      ownerId: req.user.id,
      parentId,
      kind,
      name: name.trim(),
      url: kind === 'link' ? url : null,
      platform: kind === 'link' ? platform || null : null
    });
    res.json({ bookmark: publicBookmark(created) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Modify `backend/src/app.js`** — mount router. Add import and `app.use`:

```js
import { router as bookmarksRouter } from './routes/bookmarks.js';
// ...
app.use('/bookmarks', bookmarksRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- bookmarks`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/bookmarks.js backend/src/app.js backend/tests/bookmarks.test.js
git commit -m "feat(backend): bookmarks GET/POST with parent validation"
```

---

## Task 13: Bookmarks PATCH (with cycle check)

**Files:**
- Modify: `backend/src/routes/bookmarks.js`
- Modify: `backend/tests/bookmarks.test.js`

- [ ] **Step 1: Append to `backend/tests/bookmarks.test.js`**

```js
describe('bookmarks PATCH', () => {
  it('renames a bookmark', async () => {
    const auth = await authedAlice();
    const f = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'A' }));
    const r = await auth(request(app).patch(`/bookmarks/${f.body.bookmark.id}`).send({ name: 'B' }));
    expect(r.status).toBe(200);
    expect(r.body.bookmark.name).toBe('B');
  });

  it('rejects cycle: cannot reparent ancestor under descendant', async () => {
    const auth = await authedAlice();
    const a = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'A' }));
    const b = await auth(request(app).post('/bookmarks').send({ parentId: a.body.bookmark.id, kind: 'folder', name: 'B' }));
    const res = await auth(request(app).patch(`/bookmarks/${a.body.bookmark.id}`).send({ parentId: b.body.bookmark.id }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('forbids editing other user bookmark', async () => {
    const aliceAuth = await authedAlice();
    const af = await aliceAuth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'A' }));
    const { accessToken: bobToken } = await signupUser(app, 'bob');
    const res = await request(app).patch(`/bookmarks/${af.body.bookmark.id}`)
      .set('Authorization', `Bearer ${bobToken}`).send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- bookmarks`
Expected: FAIL — PATCH returns 404 (route missing).

- [ ] **Step 3: Modify `backend/src/routes/bookmarks.js`** — add at top of imports:

```js
import { wouldCreateCycle } from '../services/tree.js';
```

Append PATCH handler:

```js
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const bm = await Bookmark.findOne({ _id: id, ownerId: req.user.id });
    if (!bm) throw new AppError('NOT_FOUND', 'Bookmark not found', 404);

    if ('parentId' in req.body) {
      const newParent = parseObjectId(req.body.parentId, 'parentId');
      await assertParentOwnedFolder(newParent, req.user.id);
      const findParentNode = async (cursorId) => {
        return Bookmark.findOne({ _id: cursorId, ownerId: req.user.id }, { parentId: 1 });
      };
      // sync cycle check using a small in-memory map (load ancestors of newParent only)
      const ancestors = [];
      let cursor = newParent;
      while (cursor) {
        const parent = await findParentNode(cursor);
        if (!parent) break;
        ancestors.push(parent);
        cursor = parent.parentId;
      }
      const lookup = (cid) => ancestors.find(n => n._id.toString() === cid?.toString());
      if (wouldCreateCycle(bm._id, newParent, lookup) || (newParent && newParent.toString() === bm._id.toString())) {
        throw new AppError('VALIDATION', 'parentId would create cycle', 400);
      }
      bm.parentId = newParent;
    }
    if (typeof req.body.name === 'string' && req.body.name.trim()) bm.name = req.body.name.trim();
    if (bm.kind === 'link') {
      if (typeof req.body.url === 'string') bm.url = req.body.url;
      if (typeof req.body.platform === 'string') bm.platform = req.body.platform;
    }
    await bm.save();
    res.json({ bookmark: publicBookmark(bm) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- bookmarks`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/bookmarks.js backend/tests/bookmarks.test.js
git commit -m "feat(backend): bookmarks PATCH with cycle prevention"
```

---

## Task 14: Bookmarks DELETE (cascade descendants)

**Files:**
- Modify: `backend/src/routes/bookmarks.js`
- Modify: `backend/tests/bookmarks.test.js`

- [ ] **Step 1: Append to `backend/tests/bookmarks.test.js`**

```js
describe('bookmarks DELETE', () => {
  it('deletes a link', async () => {
    const auth = await authedAlice();
    const link = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'link', name: 'L', url: 'https://l.test' }));
    const res = await auth(request(app).delete(`/bookmarks/${link.body.bookmark.id}`));
    expect(res.status).toBe(204);
    const list = await auth(request(app).get('/bookmarks'));
    expect(list.body.bookmarks).toHaveLength(0);
  });

  it('cascades folder delete to descendants', async () => {
    const auth = await authedAlice();
    const a = await auth(request(app).post('/bookmarks').send({ parentId: null, kind: 'folder', name: 'A' }));
    const b = await auth(request(app).post('/bookmarks').send({ parentId: a.body.bookmark.id, kind: 'folder', name: 'B' }));
    await auth(request(app).post('/bookmarks').send({ parentId: b.body.bookmark.id, kind: 'link', name: 'L', url: 'https://l.test' }));
    const res = await auth(request(app).delete(`/bookmarks/${a.body.bookmark.id}`));
    expect(res.status).toBe(204);
    const list = await auth(request(app).get('/bookmarks'));
    expect(list.body.bookmarks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- bookmarks`
Expected: FAIL — DELETE returns 404.

- [ ] **Step 3: Modify `backend/src/routes/bookmarks.js`** — append:

```js
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const bm = await Bookmark.findOne({ _id: id, ownerId: req.user.id });
    if (!bm) throw new AppError('NOT_FOUND', 'Bookmark not found', 404);
    const toDelete = [bm._id.toString()];
    let frontier = [bm._id];
    while (frontier.length) {
      const children = await Bookmark.find({ parentId: { $in: frontier }, ownerId: req.user.id }, { _id: 1 });
      frontier = children.map(c => c._id);
      for (const c of children) toDelete.push(c._id.toString());
    }
    await Bookmark.deleteMany({ _id: { $in: toDelete }, ownerId: req.user.id });
    res.status(204).end();
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- bookmarks`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/bookmarks.js backend/tests/bookmarks.test.js
git commit -m "feat(backend): bookmarks DELETE with cascade"
```

---

## Task 15: Friendship model + normalization

**Files:**
- Create: `backend/src/models/friendship.js`

- [ ] **Step 1: Create `backend/src/models/friendship.js`**

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  // userA = lower of the two ObjectId hex strings; userB = higher.
  // requesterId is the original side that initiated; status 'pending' or 'accepted'.
  userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted'], required: true, default: 'pending' }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ userA: 1, userB: 1 }, { unique: true });

schema.statics.normalizePair = function (a, b) {
  const A = a.toString();
  const B = b.toString();
  return A < B ? { userA: a, userB: b } : { userA: b, userB: a };
};

export const Friendship = mongoose.model('Friendship', schema);
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/models/friendship.js
git commit -m "feat(backend): friendship model with normalized pair index"
```

---

## Task 16: Friend request + list + requests + accept

**Files:**
- Create: `backend/src/routes/friends.js`
- Modify: `backend/src/app.js`
- Create: `backend/tests/friends.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/friends.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, resetDb, signupUser } from './helpers.js';

let app;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

describe('friends', () => {
  it('alice can request bob; bob sees incoming pending; alice sees outgoing', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');

    const req1 = await request(app).post('/friends/request')
      .set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    expect(req1.status).toBe(200);
    expect(req1.body.friendship.status).toBe('pending');

    const aliceReqs = await request(app).get('/friends/requests')
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(aliceReqs.body.outgoing).toHaveLength(1);
    expect(aliceReqs.body.incoming).toHaveLength(0);

    const bobReqs = await request(app).get('/friends/requests')
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(bobReqs.body.incoming).toHaveLength(1);
  });

  it('rejects duplicate request', async () => {
    const a = await signupUser(app, 'alice');
    await signupUser(app, 'bob');
    await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    const dup = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    expect(dup.status).toBe(409);
  });

  it('rejects requesting unknown user', async () => {
    const a = await signupUser(app, 'alice');
    const res = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'nobody' });
    expect(res.status).toBe(404);
  });

  it('rejects requesting self', async () => {
    const a = await signupUser(app, 'alice');
    const res = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'alice' });
    expect(res.status).toBe(400);
  });

  it('bob accepts; both see each other in /friends', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const req1 = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    const fid = req1.body.friendship.id;

    const accept = await request(app).post(`/friends/${fid}/accept`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(accept.status).toBe(200);

    const aliceList = await request(app).get('/friends').set('Authorization', `Bearer ${a.accessToken}`);
    const bobList = await request(app).get('/friends').set('Authorization', `Bearer ${b.accessToken}`);
    expect(aliceList.body.friends.map(f => f.username)).toContain('bob');
    expect(bobList.body.friends.map(f => f.username)).toContain('alice');
  });

  it('only addressee can accept', async () => {
    const a = await signupUser(app, 'alice');
    await signupUser(app, 'bob');
    const req1 = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    const accept = await request(app).post(`/friends/${req1.body.friendship.id}/accept`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(accept.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- friends`
Expected: FAIL — `/friends*` 404.

- [ ] **Step 3: Create `backend/src/routes/friends.js`**

```js
import express from 'express';
import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { Friendship } from '../models/friendship.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function publicFriendship(f) {
  return {
    id: f._id.toString(),
    userA: f.userA.toString(),
    userB: f.userB.toString(),
    requesterId: f.requesterId.toString(),
    status: f.status,
    createdAt: f.createdAt
  };
}

router.post('/request', async (req, res, next) => {
  try {
    const { username } = req.body || {};
    if (typeof username !== 'string' || !username.trim()) {
      throw new AppError('VALIDATION', 'username required', 400);
    }
    if (username.toLowerCase() === req.user.username) {
      throw new AppError('VALIDATION', 'cannot friend yourself', 400);
    }
    const target = await User.findOne({ username: username.toLowerCase() });
    if (!target) throw new AppError('NOT_FOUND', 'User not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const pair = Friendship.normalizePair(me, target._id);
    const exists = await Friendship.findOne(pair);
    if (exists) throw new AppError('CONFLICT', 'Friendship already exists', 409);
    const created = await Friendship.create({ ...pair, requesterId: me, status: 'pending' });
    res.json({ friendship: publicFriendship(created) });
  } catch (e) { next(e); }
});

router.get('/requests', async (req, res, next) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user.id);
    const all = await Friendship.find({
      $or: [{ userA: me }, { userB: me }],
      status: 'pending'
    });
    const outgoing = all.filter(f => f.requesterId.equals(me)).map(publicFriendship);
    const incoming = all.filter(f => !f.requesterId.equals(me)).map(publicFriendship);
    res.json({ incoming, outgoing });
  } catch (e) { next(e); }
});

router.post('/:id/accept', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const f = await Friendship.findById(req.params.id);
    if (!f) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (!(f.userA.equals(me) || f.userB.equals(me))) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (f.requesterId.equals(me)) throw new AppError('FORBIDDEN', 'Only addressee can accept', 403);
    if (f.status === 'accepted') return res.json({ friendship: publicFriendship(f) });
    f.status = 'accepted';
    await f.save();
    res.json({ friendship: publicFriendship(f) });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user.id);
    const accepted = await Friendship.find({
      $or: [{ userA: me }, { userB: me }],
      status: 'accepted'
    });
    const ids = accepted.map(f => f.userA.equals(me) ? f.userB : f.userA);
    const users = await User.find({ _id: { $in: ids } });
    res.json({
      friends: users.map(u => ({ id: u._id.toString(), username: u.username }))
    });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Modify `backend/src/app.js`** — mount router:

```js
import { router as friendsRouter } from './routes/friends.js';
// ...
app.use('/friends', friendsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- friends`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/friends.js backend/src/app.js backend/tests/friends.test.js
git commit -m "feat(backend): friend request, accept, list, requests"
```

---

## Task 17: Friends DELETE (reject + unfriend)

**Files:**
- Modify: `backend/src/routes/friends.js`
- Modify: `backend/tests/friends.test.js`

- [ ] **Step 1: Append to `backend/tests/friends.test.js`**

```js
  it('either party can delete pending (reject)', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const req1 = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    const del = await request(app).delete(`/friends/${req1.body.friendship.id}`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(del.status).toBe(204);
    const reqs = await request(app).get('/friends/requests').set('Authorization', `Bearer ${a.accessToken}`);
    expect(reqs.body.outgoing).toHaveLength(0);
  });

  it('either party can delete accepted (unfriend)', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const r1 = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    await request(app).post(`/friends/${r1.body.friendship.id}/accept`).set('Authorization', `Bearer ${b.accessToken}`);
    const del = await request(app).delete(`/friends/${r1.body.friendship.id}`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(del.status).toBe(204);
  });

  it('non-party cannot delete', async () => {
    const a = await signupUser(app, 'alice');
    await signupUser(app, 'bob');
    const c = await signupUser(app, 'carol');
    const r1 = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    const del = await request(app).delete(`/friends/${r1.body.friendship.id}`).set('Authorization', `Bearer ${c.accessToken}`);
    expect(del.status).toBe(404);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- friends`
Expected: FAIL — DELETE returns 404 (handler missing).

- [ ] **Step 3: Modify `backend/src/routes/friends.js`** — append:

```js
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const f = await Friendship.findById(req.params.id);
    if (!f) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (!(f.userA.equals(me) || f.userB.equals(me))) throw new AppError('NOT_FOUND', 'Not found', 404);
    await f.deleteOne();
    res.status(204).end();
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- friends`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/friends.js backend/tests/friends.test.js
git commit -m "feat(backend): friends DELETE (reject + unfriend)"
```

---

## Task 18: requireFriendOf middleware + friend bookmarks endpoint

**Files:**
- Modify: `backend/src/middleware/auth.js`
- Modify: `backend/src/routes/friends.js`
- Modify: `backend/tests/friends.test.js`

- [ ] **Step 1: Append to `backend/tests/friends.test.js`**

```js
describe('friend bookmark visibility', () => {
  it('non-friend gets 403; friend gets tree', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    await request(app).post('/bookmarks').set('Authorization', `Bearer ${a.accessToken}`)
      .send({ parentId: null, kind: 'folder', name: 'AlicesFolder' });

    const blocked = await request(app).get('/users/alice/bookmarks').set('Authorization', `Bearer ${b.accessToken}`);
    expect(blocked.status).toBe(403);

    const r1 = await request(app).post('/friends/request').set('Authorization', `Bearer ${a.accessToken}`).send({ username: 'bob' });
    await request(app).post(`/friends/${r1.body.friendship.id}/accept`).set('Authorization', `Bearer ${b.accessToken}`);

    const ok = await request(app).get('/users/alice/bookmarks').set('Authorization', `Bearer ${b.accessToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.bookmarks[0].name).toBe('AlicesFolder');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- friends`
Expected: FAIL — `/users/...` 404.

- [ ] **Step 3: Modify `backend/src/middleware/auth.js`** — append:

```js
import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { Friendship } from '../models/friendship.js';
import { GroupMember } from '../models/groupMember.js';

export function requireFriendOf(paramName = 'username') {
  return async (req, _res, next) => {
    try {
      const username = req.params[paramName];
      const target = await User.findOne({ username: (username || '').toLowerCase() });
      if (!target) return next(new AppError('NOT_FOUND', 'User not found', 404));
      if (target._id.equals(req.user.id)) {
        req.targetUser = target;
        return next();
      }
      const me = new mongoose.Types.ObjectId(req.user.id);
      const pair = Friendship.normalizePair(me, target._id);
      const f = await Friendship.findOne({ ...pair, status: 'accepted' });
      if (!f) return next(new AppError('FORBIDDEN', 'Not friends', 403));
      req.targetUser = target;
      next();
    } catch (e) { next(e); }
  };
}

export function requireGroupMember(paramName = 'id') {
  return async (req, _res, next) => {
    try {
      const groupId = req.params[paramName];
      if (!mongoose.isValidObjectId(groupId)) return next(new AppError('NOT_FOUND', 'Not found', 404));
      const m = await GroupMember.findOne({ groupId, userId: req.user.id });
      if (!m) return next(new AppError('FORBIDDEN', 'Not a member', 403));
      req.groupMember = m;
      next();
    } catch (e) { next(e); }
  };
}

export function requireGroupAdmin(paramName = 'id') {
  return async (req, _res, next) => {
    try {
      const groupId = req.params[paramName];
      if (!mongoose.isValidObjectId(groupId)) return next(new AppError('NOT_FOUND', 'Not found', 404));
      const m = await GroupMember.findOne({ groupId, userId: req.user.id, role: 'admin' });
      if (!m) return next(new AppError('FORBIDDEN', 'Admin only', 403));
      req.groupMember = m;
      next();
    } catch (e) { next(e); }
  };
}
```

(Note: this file will fail to import until `groupMember.js` exists. We create it now to keep the middleware file canonical, even though group routes come in later tasks. Make a placeholder model now.)

Create `backend/src/models/groupMember.js` (placeholder, will be fully fleshed in Task 21):

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['admin', 'member'], required: true, default: 'member' }
}, { timestamps: { createdAt: 'joinedAt', updatedAt: false } });

schema.index({ groupId: 1, userId: 1 }, { unique: true });

export const GroupMember = mongoose.model('GroupMember', schema);
```

- [ ] **Step 4: Modify `backend/src/routes/friends.js`** — at top imports add:

```js
import { Bookmark } from '../models/bookmark.js';
import { requireFriendOf } from '../middleware/auth.js';
```

Append at end of file (this needs to be on the **app**, not the `/friends` router, since the path is `/users/:username/bookmarks`):

```js
export const userBookmarksRouter = express.Router();
userBookmarksRouter.use(requireAuth);

userBookmarksRouter.get('/users/:username/bookmarks', requireFriendOf('username'), async (req, res, next) => {
  try {
    const target = req.targetUser;
    const parentIdRaw = req.query.parentId;
    const parentId = (parentIdRaw && parentIdRaw !== 'null') ? parentIdRaw : null;
    const list = await Bookmark.find({ ownerId: target._id, parentId }).sort({ createdAt: 1 });
    res.json({ bookmarks: list.map(b => ({
      id: b._id.toString(),
      parentId: b.parentId ? b.parentId.toString() : null,
      kind: b.kind,
      name: b.name,
      url: b.url,
      platform: b.platform,
      createdAt: b.createdAt
    })) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Modify `backend/src/app.js`** — mount `userBookmarksRouter`:

```js
import { router as friendsRouter, userBookmarksRouter } from './routes/friends.js';
// ...
app.use(userBookmarksRouter);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test -- friends`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/auth.js backend/src/models/groupMember.js backend/src/routes/friends.js backend/src/app.js backend/tests/friends.test.js
git commit -m "feat(backend): friend bookmark visibility + group member/admin guards"
```

---

## Task 19: Group + JoinRequest models

**Files:**
- Create: `backend/src/models/group.js`
- Create: `backend/src/models/joinRequest.js`

- [ ] **Step 1: Create `backend/src/models/group.js`**

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  parentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const Group = mongoose.model('Group', schema);
```

- [ ] **Step 2: Create `backend/src/models/joinRequest.js`**

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], required: true, default: 'pending' }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ groupId: 1, userId: 1, status: 1 });

export const JoinRequest = mongoose.model('JoinRequest', schema);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/group.js backend/src/models/joinRequest.js
git commit -m "feat(backend): group + joinRequest models"
```

---

## Task 20: Groups POST + GET (create + list mine + nested cycle)

**Files:**
- Create: `backend/src/routes/groups.js`
- Modify: `backend/src/app.js`
- Create: `backend/tests/groups.test.js`

- [ ] **Step 1: Write the failing test `backend/tests/groups.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, resetDb, signupUser } from './helpers.js';

let app;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

describe('groups create + list', () => {
  it('creator becomes admin and member; group appears in /groups', async () => {
    const a = await signupUser(app, 'alice');
    const c = await request(app).post('/groups')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'Reading Club' });
    expect(c.status).toBe(200);
    expect(c.body.group.name).toBe('Reading Club');

    const list = await request(app).get('/groups').set('Authorization', `Bearer ${a.accessToken}`);
    expect(list.body.groups).toHaveLength(1);
    expect(list.body.groups[0].id).toBe(c.body.group.id);
  });

  it('GET /groups/:id requires membership', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const denied = await request(app).get(`/groups/${g.body.group.id}`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(denied.status).toBe(403);
  });

  it('creates a subgroup; subgroups are listed under children', async () => {
    const a = await signupUser(app, 'alice');
    const parent = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'P' });
    const child = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'C', parentGroupId: parent.body.group.id });
    expect(child.status).toBe(200);
    const children = await request(app).get(`/groups/${parent.body.group.id}/children`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(children.body.groups).toHaveLength(1);
    expect(children.body.groups[0].id).toBe(child.body.group.id);
  });

  it('rejects subgroup with non-existent parent', async () => {
    const a = await signupUser(app, 'alice');
    const res = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'C', parentGroupId: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(400);
  });

  it('non-member parent: cannot create subgroup under group you are not member of', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const res = await request(app).post('/groups').set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'C', parentGroupId: g.body.group.id });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- groups`
Expected: FAIL — `/groups` 404.

- [ ] **Step 3: Create `backend/src/routes/groups.js`**

```js
import express from 'express';
import mongoose from 'mongoose';
import { Group } from '../models/group.js';
import { GroupMember } from '../models/groupMember.js';
import { requireAuth, requireGroupMember } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router();
router.use(requireAuth);

function publicGroup(g) {
  return {
    id: g._id.toString(),
    parentGroupId: g.parentGroupId ? g.parentGroupId.toString() : null,
    name: g.name,
    adminId: g.adminId.toString(),
    createdAt: g.createdAt
  };
}

router.post('/', async (req, res, next) => {
  try {
    const { name, parentGroupId } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('VALIDATION', 'name required', 400);
    }
    let parent = null;
    if (parentGroupId) {
      if (!mongoose.isValidObjectId(parentGroupId)) {
        throw new AppError('VALIDATION', 'invalid parentGroupId', 400);
      }
      parent = await Group.findById(parentGroupId);
      if (!parent) throw new AppError('VALIDATION', 'parent group not found', 400);
      const m = await GroupMember.findOne({ groupId: parent._id, userId: req.user.id });
      if (!m) throw new AppError('FORBIDDEN', 'Not a member of parent group', 403);
    }
    const created = await Group.create({
      name: name.trim(),
      parentGroupId: parent ? parent._id : null,
      adminId: req.user.id
    });
    await GroupMember.create({ groupId: created._id, userId: req.user.id, role: 'admin' });
    res.json({ group: publicGroup(created) });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const memberships = await GroupMember.find({ userId: req.user.id });
    const ids = memberships.map(m => m.groupId);
    const groups = await Group.find({ _id: { $in: ids } }).sort({ createdAt: 1 });
    res.json({ groups: groups.map(publicGroup) });
  } catch (e) { next(e); }
});

router.get('/:id', requireGroupMember('id'), async (req, res, next) => {
  try {
    const g = await Group.findById(req.params.id);
    if (!g) throw new AppError('NOT_FOUND', 'Not found', 404);
    res.json({ group: publicGroup(g) });
  } catch (e) { next(e); }
});

router.get('/:id/children', requireGroupMember('id'), async (req, res, next) => {
  try {
    const list = await Group.find({ parentGroupId: req.params.id }).sort({ createdAt: 1 });
    res.json({ groups: list.map(publicGroup) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Modify `backend/src/app.js`** — mount router:

```js
import { router as groupsRouter } from './routes/groups.js';
// ...
app.use('/groups', groupsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- groups`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/groups.js backend/src/app.js backend/tests/groups.test.js
git commit -m "feat(backend): groups POST/GET with creator-as-admin + subgroup parent membership"
```

---

## Task 21: Group join request flow (request + admin approve/reject + member list + kick)

**Files:**
- Modify: `backend/src/routes/groups.js`
- Modify: `backend/tests/groups.test.js`

- [ ] **Step 1: Append to `backend/tests/groups.test.js`**

```js
describe('groups membership', () => {
  it('user joins via approve-flow', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const join = await request(app).post(`/groups/${g.body.group.id}/join`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(join.status).toBe(200);

    const reqs = await request(app).get(`/groups/${g.body.group.id}/requests`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(reqs.body.requests).toHaveLength(1);

    const reqId = reqs.body.requests[0].id;
    const ok = await request(app).post(`/groups/${g.body.group.id}/requests/${reqId}/approve`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(ok.status).toBe(200);

    const members = await request(app).get(`/groups/${g.body.group.id}/members`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(members.body.members.map(m => m.username).sort()).toEqual(['alice', 'bob']);
  });

  it('non-admin cannot list requests or approve', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    await request(app).post(`/groups/${g.body.group.id}/join`).set('Authorization', `Bearer ${b.accessToken}`);
    const reqs = await request(app).get(`/groups/${g.body.group.id}/requests`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(reqs.status).toBe(403);
  });

  it('rejects duplicate join while pending or member', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    await request(app).post(`/groups/${g.body.group.id}/join`).set('Authorization', `Bearer ${b.accessToken}`);
    const dup = await request(app).post(`/groups/${g.body.group.id}/join`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(dup.status).toBe(409);
  });

  it('admin rejects request', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    await request(app).post(`/groups/${g.body.group.id}/join`).set('Authorization', `Bearer ${b.accessToken}`);
    const reqs = await request(app).get(`/groups/${g.body.group.id}/requests`).set('Authorization', `Bearer ${a.accessToken}`);
    const del = await request(app).delete(`/groups/${g.body.group.id}/requests/${reqs.body.requests[0].id}`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(del.status).toBe(204);
  });

  it('admin kicks member; sole admin cannot kick self', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    await request(app).post(`/groups/${g.body.group.id}/join`).set('Authorization', `Bearer ${b.accessToken}`);
    const reqs = await request(app).get(`/groups/${g.body.group.id}/requests`).set('Authorization', `Bearer ${a.accessToken}`);
    await request(app).post(`/groups/${g.body.group.id}/requests/${reqs.body.requests[0].id}/approve`).set('Authorization', `Bearer ${a.accessToken}`);
    const kick = await request(app).delete(`/groups/${g.body.group.id}/members/${b.user.id}`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(kick.status).toBe(204);
    const selfKick = await request(app).delete(`/groups/${g.body.group.id}/members/${a.user.id}`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(selfKick.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- groups`
Expected: FAIL — join/requests/members/admin endpoints 404.

- [ ] **Step 3: Modify `backend/src/routes/groups.js`** — at top imports add:

```js
import { JoinRequest } from '../models/joinRequest.js';
import { User } from '../models/user.js';
import { requireGroupAdmin } from '../middleware/auth.js';
```

Append handlers:

```js
router.post('/:id/join', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const g = await Group.findById(req.params.id);
    if (!g) throw new AppError('NOT_FOUND', 'Not found', 404);

    const existingMember = await GroupMember.findOne({ groupId: g._id, userId: req.user.id });
    if (existingMember) throw new AppError('CONFLICT', 'Already a member', 409);
    const existingPending = await JoinRequest.findOne({ groupId: g._id, userId: req.user.id, status: 'pending' });
    if (existingPending) throw new AppError('CONFLICT', 'Request already pending', 409);

    const jr = await JoinRequest.create({ groupId: g._id, userId: req.user.id, status: 'pending' });
    res.json({ request: { id: jr._id.toString(), status: jr.status } });
  } catch (e) { next(e); }
});

router.get('/:id/requests', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const list = await JoinRequest.find({ groupId: req.params.id, status: 'pending' });
    const userIds = list.map(r => r.userId);
    const users = await User.find({ _id: { $in: userIds } }, { username: 1 });
    const byId = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({
      requests: list.map(r => ({
        id: r._id.toString(),
        userId: r.userId.toString(),
        username: byId.get(r.userId.toString()),
        createdAt: r.createdAt
      }))
    });
  } catch (e) { next(e); }
});

router.post('/:id/requests/:reqId/approve', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const jr = await JoinRequest.findOne({ _id: req.params.reqId, groupId: req.params.id, status: 'pending' });
    if (!jr) throw new AppError('NOT_FOUND', 'Not found', 404);
    jr.status = 'approved';
    await jr.save();
    await GroupMember.updateOne(
      { groupId: jr.groupId, userId: jr.userId },
      { $setOnInsert: { groupId: jr.groupId, userId: jr.userId, role: 'member' } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id/requests/:reqId', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const jr = await JoinRequest.findOne({ _id: req.params.reqId, groupId: req.params.id, status: 'pending' });
    if (!jr) throw new AppError('NOT_FOUND', 'Not found', 404);
    jr.status = 'rejected';
    await jr.save();
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get('/:id/members', requireGroupMember('id'), async (req, res, next) => {
  try {
    const ms = await GroupMember.find({ groupId: req.params.id });
    const users = await User.find({ _id: { $in: ms.map(m => m.userId) } }, { username: 1 });
    const byId = new Map(users.map(u => [u._id.toString(), u.username]));
    res.json({
      members: ms.map(m => ({
        userId: m.userId.toString(),
        username: byId.get(m.userId.toString()),
        role: m.role,
        joinedAt: m.joinedAt
      }))
    });
  } catch (e) { next(e); }
});

router.delete('/:id/members/:userId', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) {
      const adminCount = await GroupMember.countDocuments({ groupId: req.params.id, role: 'admin' });
      if (adminCount <= 1) {
        throw new AppError('VALIDATION', 'sole admin cannot leave', 400);
      }
    }
    const r = await GroupMember.deleteOne({ groupId: req.params.id, userId: req.params.userId });
    if (r.deletedCount === 0) throw new AppError('NOT_FOUND', 'Member not found', 404);
    res.status(204).end();
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- groups`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/groups.js backend/tests/groups.test.js
git commit -m "feat(backend): group join requests, approve/reject, members, kick"
```

---

## Task 22: GroupFolder model + endpoints (member read, admin write)

**Files:**
- Create: `backend/src/models/groupFolder.js`
- Modify: `backend/src/routes/groups.js`
- Create: `backend/tests/groupFolders.test.js`

- [ ] **Step 1: Create `backend/src/models/groupFolder.js`**

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  parentFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupFolder', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 }
}, { timestamps: { createdAt: true, updatedAt: false } });

export const GroupFolder = mongoose.model('GroupFolder', schema);
```

- [ ] **Step 2: Write the failing test `backend/tests/groupFolders.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, resetDb, signupUser } from './helpers.js';

let app;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

async function makeGroupWithMember(adminTok, memberTok, name = 'G') {
  const g = await request(app).post('/groups').set('Authorization', `Bearer ${adminTok}`).send({ name });
  await request(app).post(`/groups/${g.body.group.id}/join`).set('Authorization', `Bearer ${memberTok}`);
  const reqs = await request(app).get(`/groups/${g.body.group.id}/requests`).set('Authorization', `Bearer ${adminTok}`);
  await request(app).post(`/groups/${g.body.group.id}/requests/${reqs.body.requests[0].id}/approve`).set('Authorization', `Bearer ${adminTok}`);
  return g.body.group.id;
}

describe('group folders', () => {
  it('admin can create folder; member can read', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const gid = await makeGroupWithMember(a.accessToken, b.accessToken);

    const create = await request(app).post(`/groups/${gid}/folders`)
      .set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'Reads' });
    expect(create.status).toBe(200);

    const list = await request(app).get(`/groups/${gid}/folders`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(list.body.folders).toHaveLength(1);
  });

  it('member cannot create folder', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const gid = await makeGroupWithMember(a.accessToken, b.accessToken);
    const res = await request(app).post(`/groups/${gid}/folders`)
      .set('Authorization', `Bearer ${b.accessToken}`).send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('non-member cannot list folders', async () => {
    const a = await signupUser(app, 'alice');
    const c = await signupUser(app, 'carol');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const res = await request(app).get(`/groups/${g.body.group.id}/folders`).set('Authorization', `Bearer ${c.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('nested folders + admin delete cascades', async () => {
    const a = await signupUser(app, 'alice');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const gid = g.body.group.id;
    const root = await request(app).post(`/groups/${gid}/folders`).set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'Root' });
    const child = await request(app).post(`/groups/${gid}/folders`).set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'Child', parentFolderId: root.body.folder.id });
    expect(child.status).toBe(200);

    const inside = await request(app).get(`/groups/${gid}/folders?parentFolderId=${root.body.folder.id}`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(inside.body.folders).toHaveLength(1);

    const del = await request(app).delete(`/groups/${gid}/folders/${root.body.folder.id}`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(del.status).toBe(204);
    const after = await request(app).get(`/groups/${gid}/folders`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(after.body.folders).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test -- groupFolders`
Expected: FAIL — `/groups/:id/folders` 404.

- [ ] **Step 4: Modify `backend/src/routes/groups.js`** — at top imports add:

```js
import { GroupFolder } from '../models/groupFolder.js';
```

Append handlers:

```js
function publicFolder(f) {
  return {
    id: f._id.toString(),
    groupId: f.groupId.toString(),
    parentFolderId: f.parentFolderId ? f.parentFolderId.toString() : null,
    name: f.name,
    createdAt: f.createdAt
  };
}

router.get('/:id/folders', requireGroupMember('id'), async (req, res, next) => {
  try {
    const parentFolderId = (req.query.parentFolderId && req.query.parentFolderId !== 'null')
      ? req.query.parentFolderId : null;
    const folders = await GroupFolder.find({ groupId: req.params.id, parentFolderId }).sort({ createdAt: 1 });
    res.json({ folders: folders.map(publicFolder) });
  } catch (e) { next(e); }
});

router.post('/:id/folders', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const { name, parentFolderId } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('VALIDATION', 'name required', 400);
    }
    let parent = null;
    if (parentFolderId) {
      if (!mongoose.isValidObjectId(parentFolderId)) {
        throw new AppError('VALIDATION', 'invalid parentFolderId', 400);
      }
      parent = await GroupFolder.findOne({ _id: parentFolderId, groupId: req.params.id });
      if (!parent) throw new AppError('VALIDATION', 'parent folder not in group', 400);
    }
    const created = await GroupFolder.create({
      groupId: req.params.id,
      parentFolderId: parent ? parent._id : null,
      name: name.trim()
    });
    res.json({ folder: publicFolder(created) });
  } catch (e) { next(e); }
});

router.delete('/:id/folders/:fid', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const root = await GroupFolder.findOne({ _id: req.params.fid, groupId: req.params.id });
    if (!root) throw new AppError('NOT_FOUND', 'Not found', 404);
    const toDelete = [root._id];
    let frontier = [root._id];
    while (frontier.length) {
      const children = await GroupFolder.find({ parentFolderId: { $in: frontier }, groupId: req.params.id }, { _id: 1 });
      frontier = children.map(c => c._id);
      for (const c of children) toDelete.push(c._id);
    }
    await GroupFolder.deleteMany({ _id: { $in: toDelete }, groupId: req.params.id });
    res.status(204).end();
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- groupFolders`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/groupFolder.js backend/src/routes/groups.js backend/tests/groupFolders.test.js
git commit -m "feat(backend): group folders read (member) + write/delete (admin)"
```

---

## Task 23: ChatMessage model + chat POST/GET history

**Files:**
- Create: `backend/src/models/chatMessage.js`
- Create: `backend/src/routes/chat.js`
- Modify: `backend/src/app.js`
- Create: `backend/tests/chat.test.js`

- [ ] **Step 1: Create `backend/src/models/chatMessage.js`**

```js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['url'], required: true, default: 'url' },
  url: { type: String, required: true, maxlength: 4096 },
  title: { type: String, default: null, maxlength: 400 },
  platform: { type: String, default: null, maxlength: 64 }
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ groupId: 1, createdAt: -1 });

export const ChatMessage = mongoose.model('ChatMessage', schema);
```

- [ ] **Step 2: Write the failing test `backend/tests/chat.test.js`**

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestApp, stopTestApp, resetDb, signupUser } from './helpers.js';

let app;
beforeAll(async () => { app = await startTestApp(); });
afterAll(async () => { await stopTestApp(); });
beforeEach(async () => { await resetDb(); });

describe('chat', () => {
  it('member posts url; member reads history newest-first', async () => {
    const a = await signupUser(app, 'alice');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const gid = g.body.group.id;

    const m1 = await request(app).post(`/groups/${gid}/chat`).set('Authorization', `Bearer ${a.accessToken}`)
      .send({ url: 'https://a.test', title: 'A', platform: 'web' });
    expect(m1.status).toBe(200);
    const m2 = await request(app).post(`/groups/${gid}/chat`).set('Authorization', `Bearer ${a.accessToken}`)
      .send({ url: 'https://b.test', title: 'B', platform: 'web' });
    expect(m2.status).toBe(200);

    const hist = await request(app).get(`/groups/${gid}/chat`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(hist.status).toBe(200);
    expect(hist.body.messages).toHaveLength(2);
    expect(hist.body.messages[0].url).toBe('https://b.test');
  });

  it('non-member 403 on post and on get', async () => {
    const a = await signupUser(app, 'alice');
    const b = await signupUser(app, 'bob');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const gid = g.body.group.id;
    const post = await request(app).post(`/groups/${gid}/chat`).set('Authorization', `Bearer ${b.accessToken}`)
      .send({ url: 'https://x.test' });
    expect(post.status).toBe(403);
    const get = await request(app).get(`/groups/${gid}/chat`).set('Authorization', `Bearer ${b.accessToken}`);
    expect(get.status).toBe(403);
  });

  it('rejects post without url', async () => {
    const a = await signupUser(app, 'alice');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const res = await request(app).post(`/groups/${g.body.group.id}/chat`).set('Authorization', `Bearer ${a.accessToken}`).send({});
    expect(res.status).toBe(400);
  });

  it('paginates with before+limit', async () => {
    const a = await signupUser(app, 'alice');
    const g = await request(app).post('/groups').set('Authorization', `Bearer ${a.accessToken}`).send({ name: 'G' });
    const gid = g.body.group.id;
    for (let i = 0; i < 5; i++) {
      await request(app).post(`/groups/${gid}/chat`).set('Authorization', `Bearer ${a.accessToken}`).send({ url: `https://${i}.test` });
    }
    const page1 = await request(app).get(`/groups/${gid}/chat?limit=2`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(page1.body.messages).toHaveLength(2);
    expect(page1.body.messages[0].url).toBe('https://4.test');
    const before = page1.body.messages[1].createdAt;
    const page2 = await request(app).get(`/groups/${gid}/chat?limit=2&before=${encodeURIComponent(before)}`).set('Authorization', `Bearer ${a.accessToken}`);
    expect(page2.body.messages).toHaveLength(2);
    expect(page2.body.messages[0].url).toBe('https://2.test');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test -- chat`
Expected: FAIL — `/groups/:id/chat` 404.

- [ ] **Step 4: Create `backend/src/routes/chat.js`**

```js
import express from 'express';
import { ChatMessage } from '../models/chatMessage.js';
import { requireAuth, requireGroupMember } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function publicMsg(m) {
  return {
    id: m._id.toString(),
    groupId: m.groupId.toString(),
    senderId: m.senderId.toString(),
    kind: m.kind,
    url: m.url,
    title: m.title,
    platform: m.platform,
    createdAt: m.createdAt
  };
}

router.get('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const filter = { groupId: req.params.id };
    if (req.query.before) {
      const d = new Date(req.query.before);
      if (Number.isNaN(d.valueOf())) throw new AppError('VALIDATION', 'invalid before', 400);
      filter.createdAt = { $lt: d };
    }
    const list = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ messages: list.map(publicMsg) });
  } catch (e) { next(e); }
});

router.post('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const { url, title, platform } = req.body || {};
    if (typeof url !== 'string' || !url.trim()) {
      throw new AppError('VALIDATION', 'url required', 400);
    }
    const created = await ChatMessage.create({
      groupId: req.params.id,
      senderId: req.user.id,
      kind: 'url',
      url: url.trim(),
      title: typeof title === 'string' ? title.trim().slice(0, 400) : null,
      platform: typeof platform === 'string' ? platform.slice(0, 64) : null
    });
    res.json({ message: publicMsg(created) });
  } catch (e) { next(e); }
});
```

- [ ] **Step 5: Modify `backend/src/app.js`** — mount chat under `/groups/:id/chat`:

```js
import { router as chatRouter } from './routes/chat.js';
// ...
app.use('/groups/:id/chat', chatRouter);
```

(Place this **after** the `/groups` mount so route param `:id` resolves correctly. The chat router uses `mergeParams: true` to inherit `:id`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test -- chat`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/models/chatMessage.js backend/src/routes/chat.js backend/src/app.js backend/tests/chat.test.js
git commit -m "feat(backend): chat URL-share post + history with before/limit"
```

---

## Task 24: Full-suite green + smoke

**Files:** none modified (verification task).

- [ ] **Step 1: Run the full test suite**

Run: `cd backend && npm test`
Expected: All tests across all files pass. No skips, no failures.

- [ ] **Step 2: Boot smoke check (optional, manual — skip if Mongo not running locally)**

Run: `cd backend && docker compose up -d && cp .env.example .env && npm run dev`
Expected (in another terminal): `curl -s localhost:4000/health` returns `{"ok":true}`.

Stop with `Ctrl-C` and `docker compose down` after.

- [ ] **Step 3: Final commit (if any uncommitted artifacts)**

```bash
git status
# if clean, no commit needed
```

---

## Self-Review (already applied; recorded for traceability)

**Spec coverage check:**
- §3 Architecture — Tasks 1, 2.
- §4 Tech Stack — Task 1.
- §5 Data Model: User → T3, RefreshToken → T5, Bookmark → T11, Friendship → T15, Group → T19, GroupMember → T18 (placeholder) used by groups in T20+, JoinRequest → T19, GroupFolder → T22, ChatMessage → T23.
- §6.1 Auth — T7 (signup, login, /me), T8 (refresh, logout).
- §6.2 Bookmarks — T12 (GET, POST), T13 (PATCH), T14 (DELETE).
- §6.3 Friends — T16 (request, accept, list, requests), T17 (DELETE), T18 (`/users/:username/bookmarks`).
- §6.4 Groups — T20 (POST/GET/children), T21 (join, requests, members, kick).
- §6.5 Group folders — T22.
- §6.6 Chat — T23.
- §7 Auth/Authz — `requireAuth` T6; `requireFriendOf`, `requireGroupMember`, `requireGroupAdmin` T18.
- §8 Error format — T2.
- §10 Rate limit — T9.
- §12 Testing — distributed across all tasks; tree integrity in T10/T13; friendship visibility T18; admin gating T22; refresh rotation T8; cycle prevention T13.

**Placeholder scan:** none. Each step has explicit code or commands.

**Type consistency:** model field names (`ownerId`, `parentId`, `userA/userB`, `parentGroupId`, `parentFolderId`, `groupId`, `senderId`, `kind`) are stable across tasks. Public DTOs (`publicBookmark`, `publicGroup`, `publicFolder`, `publicMsg`, `publicFriendship`, `publicUser`) all expose `id` (string) consistently. JWT payload uses `sub` for userId in both `signAccess` (T5) and `verifyAccess` consumer in `requireAuth` (T6).

---

## Execution

Dispatch via subagent-driven-development: one fresh subagent per task, two-stage review between tasks. Tasks are sequential; each leaves the suite green so the next subagent inherits a known-good baseline.

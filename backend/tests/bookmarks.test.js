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

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

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
});

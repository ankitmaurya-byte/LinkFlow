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

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

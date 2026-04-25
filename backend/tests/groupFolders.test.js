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

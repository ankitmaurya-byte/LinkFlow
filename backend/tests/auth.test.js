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

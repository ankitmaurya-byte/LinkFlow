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

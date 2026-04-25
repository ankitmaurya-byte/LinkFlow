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

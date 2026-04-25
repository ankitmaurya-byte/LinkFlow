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

  it('passwordHash is absent from default findOne result (select: false)', async () => {
    await User.create({ username: 'eve', passwordHash: 'secret-hash-1' });
    const found = await User.findOne({ username: 'eve' });
    expect(found.username).toBe('eve');
    expect(found.passwordHash).toBeUndefined();

    const explicit = await User.findOne({ username: 'eve' }).select('+passwordHash');
    expect(explicit.passwordHash).toBe('secret-hash-1');
  });
});

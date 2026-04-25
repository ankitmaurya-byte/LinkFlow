import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/services/passwords.js';

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('hunter2hunter2');
    expect(hash).not.toBe('hunter2hunter2');
    expect(await verifyPassword('hunter2hunter2', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

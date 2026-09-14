import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces argon2id hashes that verify the original password only', async () => {
    const hashed = await service.hash('correct horse battery staple');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hashed, 'correct horse battery staple')).toBe(true);
    expect(await service.verify(hashed, 'Correct horse battery staple')).toBe(false);
  });

  it('salts each hash', async () => {
    const [a, b] = await Promise.all([service.hash('same'), service.hash('same')]);
    expect(a).not.toBe(b);
  });

  it('treats a malformed stored hash as a failed verification', async () => {
    expect(await service.verify('not-a-hash', 'anything')).toBe(false);
  });

  it('verifyDecoy always fails', async () => {
    expect(await service.verifyDecoy('anything')).toBe(false);
  });
});

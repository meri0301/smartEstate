import { Injectable } from '@nestjs/common';
import { hash, hashSync, verify } from '@node-rs/argon2';

/**
 * Argon2id (the library default; the test suite asserts the `$argon2id$` prefix)
 * with the OWASP minimum configuration: 19 MiB memory, 2 iterations, 1 lane.
 * Parameters are encoded in the hash, so they can be raised later and old
 * hashes still verify.
 */
@Injectable()
export class PasswordService {
  private static readonly OPTIONS = {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  /** Hash of a random secret, used to keep failed logins for unknown accounts as slow as real ones. */
  private readonly decoyHash = hashSync(crypto.randomUUID(), PasswordService.OPTIONS);

  hash(plain: string): Promise<string> {
    return hash(plain, PasswordService.OPTIONS);
  }

  async verify(hashValue: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashValue, plain);
    } catch {
      return false;
    }
  }

  /** Performs a full verification against a decoy hash; always returns false. */
  async verifyDecoy(plain: string): Promise<false> {
    await this.verify(this.decoyHash, plain);
    return false;
  }
}

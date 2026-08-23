import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing, argon2id.
 *
 * Unlike a claim code, a password is low-entropy and human-chosen, so the
 * defence has to be cost rather than keyspace. These are the OWASP-recommended
 * argon2id parameters: 19 MiB of memory, three passes. Memory hardness is what
 * makes GPU cracking uneconomic, which is the whole point of choosing argon2id
 * over anything faster.
 */
const OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 3,
  outputLen: 32,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return hash(password, OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed stored hash, so a corrupt
 * row is a failed login and not a 500 that reveals the account exists.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    return false;
  }
}

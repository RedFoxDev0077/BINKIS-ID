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

/**
 * Six, at the client's request, repeated three times between September and
 * 26 October 2026.
 *
 * Ten was my choice and it was the wrong trade for this product. The thing a
 * password protects here is a collection of registered pieces, and the piece
 * itself is protected by something else entirely: a nine-character claim code
 * that is used once and then spent. Someone who guesses a collector's password
 * cannot claim anything new with it and cannot move a piece without the
 * transfer being accepted by the other side.
 *
 * Against that, the cost of ten was real and immediate. Every scan happens on
 * a phone, one-handed, in a shop, and a collector who cannot get past the
 * signup form never registers the piece they are holding. Argon2id at 19 MiB
 * and three passes is what makes a short password expensive to attack, and
 * that has not changed.
 *
 * No complexity rule, deliberately. There is no uppercase or symbol
 * requirement here and there never was one: those rules push people towards
 * Password1! and a sticky note, and NIST dropped them in SP 800-63B for
 * exactly that reason.
 */
export const MIN_PASSWORD_LENGTH = 6;

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

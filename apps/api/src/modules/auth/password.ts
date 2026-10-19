import { randomBytes } from 'node:crypto';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** Algorithm.Argon2id — the library's enum is an ambient const enum (unusable with isolatedModules). */
const ARGON2ID = 2 as Algorithm;

/**
 * Password hashing: Argon2id via @node-rs/argon2 (Rust `argon2` crate; standard PHC strings).
 * Parameters = OWASP Password Storage Cheat Sheet minimum for Argon2id:
 * memory 19 MiB, 2 iterations, parallelism 1, 16-byte random salt, 32-byte tag.
 * Raising them later is safe: hashes with other parameters are upgraded on the next login.
 */
export const ARGON2_PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

const CURRENT_PREFIX = `$argon2id$v=19$m=${ARGON2_PARAMS.memoryCost},t=${ARGON2_PARAMS.timeCost},p=${ARGON2_PARAMS.parallelism}$`;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

/** Constant-time verification (inside the library). Malformed hashes count as a mismatch. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function needsRehash(passwordHash: string): boolean {
  return !passwordHash.startsWith(CURRENT_PREFIX);
}

let dummyHash: Promise<string> | undefined;

/**
 * A real hash of a random secret. Login verifies against it when the account does not exist or
 * has no password, so unknown and known e-mails take the same (hashing) time.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHash;
}

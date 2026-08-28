import 'server-only';

import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import { config } from '@/server/config';

const scrypt = promisify(scryptCallback) as (
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt parameters. N = 2^15 costs roughly 100 ms on commodity hardware,
 * which is a deliberate brake on offline cracking of a 6-digit secret.
 */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Domain separation keeps a PIN digest from ever validating an OTP. */
export const SecretDomain = {
  pin: 'pin',
  otp: 'otp',
} as const;

export type SecretDomainName = (typeof SecretDomain)[keyof typeof SecretDomain];

/**
 * Two independent sub-keys are derived from the master pepper so that the
 * blind index can never be used to attack the verification digest.
 */
function subKey(info: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(config.secrets.pepper, 'utf8'), Buffer.alloc(0), Buffer.from(info, 'utf8'), 32),
  );
}

let cachedPepperKey: Buffer | null = null;
let cachedLookupKey: Buffer | null = null;

function pepperKey(): Buffer {
  cachedPepperKey ??= subKey('erp-auth/kdf-pepper/v1');
  return cachedPepperKey;
}

function lookupKey(): Buffer {
  cachedLookupKey ??= subKey('erp-auth/blind-index/v1');
  return cachedLookupKey;
}

/** Binds the server-side pepper into the secret before the slow KDF runs. */
function pepper(secret: string, domain: string): Buffer {
  return createHmac('sha256', pepperKey()).update(`${domain}:${secret}`).digest();
}

/**
 * Hashes a low-entropy secret (PIN, OTP) with a salted, peppered, slow KDF.
 * The result is self-describing so the cost parameters can be raised later
 * without invalidating existing digests.
 */
export async function hashSecret(secret: string, domain: SecretDomainName): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(pepper(secret, domain), salt, KEY_LENGTH, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/** Constant-time verification. Malformed input returns false instead of throwing. */
export async function verifySecret(
  secret: string,
  stored: string | null | undefined,
  domain: SecretDomainName,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  // Refuse absurd parameters rather than letting a poisoned row exhaust memory.
  if (N < 1024 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(pepper(secret, domain), salt, expected.length, { N, r, p, maxmem: SCRYPT.maxmem });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Keyed blind index. Lets the server answer "which employee owns this PIN?"
 * with a single indexed lookup, while a stolen database alone reveals nothing:
 * without the pepper the 10^6 PIN space cannot be enumerated against it.
 */
export function blindIndex(secret: string, domain: SecretDomainName): string {
  return createHmac('sha256', lookupKey()).update(`${domain}:${secret}`).digest('base64url');
}

/** Opaque, high-entropy token for sessions, QR challenges and reset handles. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * High-entropy tokens do not need a slow KDF — a single SHA-256 is both
 * sufficient and fast enough to run on every request.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

/** Constant-time string comparison that does not leak length via early exit. */
export function safeEquals(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(digestA, digestB);
}

/** Uniformly distributed numeric code — never Math.random(). */
export function generateNumericCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

/** Stable fingerprint used for rate-limit buckets. Never mixed with secrets. */
export function fingerprint(...parts: (string | null | undefined)[]): string {
  return createHash('sha256')
    .update(parts.map((part) => part ?? '').join('|'))
    .digest('base64url')
    .slice(0, 22);
}

import { describe, expect, it } from 'vitest';

import { blindIndex, generateNumericCode, generateToken, hashSecret, hashToken, safeEquals, verifySecret } from '@/server/security/crypto';
import { isWeakPin } from '@/server/security/validation';

describe('secret hashing', () => {
  it('verifies a correct secret and rejects a wrong one', async () => {
    const digest = await hashSecret('483916', 'pin');

    await expect(verifySecret('483916', digest, 'pin')).resolves.toBe(true);
    await expect(verifySecret('483917', digest, 'pin')).resolves.toBe(false);
  });

  it('salts every digest, so the same PIN never produces the same hash', async () => {
    const [first, second] = await Promise.all([hashSecret('483916', 'pin'), hashSecret('483916', 'pin')]);

    expect(first).not.toBe(second);
    await expect(verifySecret('483916', second, 'pin')).resolves.toBe(true);
  });

  it('separates domains: a PIN digest never validates as an OTP', async () => {
    const digest = await hashSecret('483916', 'pin');

    await expect(verifySecret('483916', digest, 'otp')).resolves.toBe(false);
  });

  it('never contains the plaintext secret', async () => {
    const digest = await hashSecret('483916', 'pin');

    expect(digest).not.toContain('483916');
    expect(digest.startsWith('scrypt$')).toBe(true);
  });

  it('treats malformed or absent digests as a failed verification', async () => {
    await expect(verifySecret('483916', null, 'pin')).resolves.toBe(false);
    await expect(verifySecret('483916', '', 'pin')).resolves.toBe(false);
    await expect(verifySecret('483916', 'not-a-digest', 'pin')).resolves.toBe(false);
    await expect(verifySecret('483916', 'scrypt$9$9$9$aaaa$bbbb', 'pin')).resolves.toBe(false);
  });
});

describe('blind index', () => {
  it('is deterministic for the same secret', () => {
    expect(blindIndex('483916', 'pin')).toBe(blindIndex('483916', 'pin'));
  });

  it('differs for different secrets and different domains', () => {
    expect(blindIndex('483916', 'pin')).not.toBe(blindIndex('483917', 'pin'));
    expect(blindIndex('483916', 'pin')).not.toBe(blindIndex('483916', 'otp'));
  });

  it('does not leak the secret', () => {
    expect(blindIndex('483916', 'pin')).not.toContain('483916');
  });
});

describe('tokens', () => {
  it('generates unique, URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken(32)));

    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes tokens deterministically without revealing them', () => {
    const token = generateToken(32);

    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it('compares strings without leaking equality through length', () => {
    expect(safeEquals('abc', 'abc')).toBe(true);
    expect(safeEquals('abc', 'abd')).toBe(false);
    expect(safeEquals('abc', 'abcdef')).toBe(false);
  });

  it('produces numeric codes of the requested length', () => {
    const codes = Array.from({ length: 50 }, () => generateNumericCode(6));

    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    // 50 cryptographically random codes should not all collapse to one value.
    expect(new Set(codes).size).toBeGreaterThan(1);
  });
});

describe('PIN strength policy', () => {
  it('rejects obvious patterns', () => {
    for (const pin of ['000000', '111111', '123456', '654321', '121212', '123123', '112233', '123321', '890123']) {
      expect(isWeakPin(pin), pin).toBe(true);
    }
  });

  it('accepts unpredictable PINs', () => {
    for (const pin of ['483916', '470182', '315907', '826431', '594073']) {
      expect(isWeakPin(pin), pin).toBe(false);
    }
  });
});

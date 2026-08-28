import 'server-only';

import { z } from 'zod';

import { config } from '@/server/config';
import { AuthError } from '@/server/security/errors';

export const pinSchema = z
  .string()
  .regex(new RegExp(`^\\d{${config.pin.length}}$`), 'PIN must be exactly the configured number of digits');

export const otpSchema = z.string().regex(/^\d{6}$/);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const uuidSchema = z.string().uuid();
export const tokenSchema = z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/);

export const permissionKeySchema = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);

export const employeeCodeSchema = z.string().trim().regex(/^[A-Za-z0-9._-]{2,32}$/);
export const fullNameSchema = z.string().trim().min(2).max(120);
export const phoneSchema = z.string().trim().regex(/^[0-9+][0-9 +()-]{4,24}$/);

/**
 * A six digit PIN has only 10^6 possibilities; obvious patterns cut that down
 * to a handful, so they are refused outright rather than merely discouraged.
 */
const OBVIOUS_PINS = new Set([
  '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999',
  '123456', '654321', '012345', '543210', '112233', '121212', '123123', '696969', '101010', '123321',
  '456789', '987654', '111222', '222111', '159753', '147258', '789456',
]);

export function isWeakPin(pin: string): boolean {
  if (OBVIOUS_PINS.has(pin)) return true;

  const digits = [...pin].map(Number);

  // Every digit identical.
  if (digits.every((digit) => digit === digits[0])) return true;

  // Strictly ascending or descending by one, with wraparound (890123).
  const stepIs = (step: number) =>
    digits.every((digit, index) => index === 0 || digit === (digits[index - 1] + step + 10) % 10);
  if (stepIs(1) || stepIs(-1)) return true;

  // A short block repeated to fill the PIN (ababab, abcabc).
  for (const size of [1, 2, 3]) {
    if (pin.length % size !== 0) continue;
    const block = pin.slice(0, size);
    if (pin.match(new RegExp(`^(${block})+$`))) return true;
  }

  // Mirror patterns (123321).
  if (pin === [...pin].reverse().join('')) return true;

  return false;
}

export function assertStrongPin(pin: string): void {
  const parsed = pinSchema.safeParse(pin);
  if (!parsed.success) throw new AuthError('invalid_request');
  if (isWeakPin(pin)) throw new AuthError('weak_pin');
}

/** Parses a request body against a schema, collapsing any failure to 400. */
export async function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AuthError('invalid_request');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AuthError('invalid_request');
  }
  return result.data;
}

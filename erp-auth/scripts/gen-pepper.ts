/** Prints a fresh AUTH_PIN_PEPPER. Never commit the output. */
import { randomBytes } from 'node:crypto';

console.log(randomBytes(48).toString('base64url'));

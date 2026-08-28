import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadDotenv } from 'dotenv';

/**
 * Standalone scripts do not get Next.js's automatic .env handling, so they load
 * the same files here, with .env.local winning as it does in the framework.
 */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const path = join(process.cwd(), file);
    if (existsSync(path)) loadDotenv({ path, override: false, quiet: true });
  }
}

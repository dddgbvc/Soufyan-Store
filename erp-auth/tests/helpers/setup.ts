import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadDotenv } from 'dotenv';

for (const file of ['.env.test.local', '.env.local', '.env']) {
  const path = join(process.cwd(), file);
  if (existsSync(path)) loadDotenv({ path, override: false, quiet: true });
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Tests need a Postgres database. Set DATABASE_URL in .env.local (see docs/testing in README.md).',
  );
}

// Keep the suite honest about which pepper it is using: a fixed, obviously
// non-production value so a leaked test fixture is worthless.
process.env.AUTH_PIN_PEPPER ??= 'test-pepper-not-for-production-use-0123456789';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.MAIL_PROVIDER = 'console';
process.env.MAIL_DEBUG_SHOW_BODY = 'false';

/**
 * Applies every SQL file in db/migrations, in filename order, exactly once.
 * Safe to re-run: applied files are tracked in erp_auth.schema_migrations.
 *
 *   npm run db:migrate
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadEnv } from './load-env';

loadEnv();

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

async function main(): Promise<void> {
  const { default: postgres } = await import('postgres');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local first.');

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  try {
    await sql`create schema if not exists erp_auth`;
    await sql`
      create table if not exists erp_auth.schema_migrations (
        filename    text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      )
    `;

    const applied = new Map(
      (await sql<{ filename: string; checksum: string }[]>`
        select filename, checksum from erp_auth.schema_migrations
      `).map((row) => [row.filename, row.checksum]),
    );

    const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();

    for (const filename of files) {
      const body = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex').slice(0, 16);
      const previous = applied.get(filename);

      if (previous === checksum) {
        console.log(`  = ${filename} (already applied)`);
        continue;
      }

      if (previous && previous !== checksum) {
        // The catalogue migration is intentionally re-runnable; a changed
        // structural migration is a mistake worth stopping for.
        if (!filename.includes('catalog')) {
          throw new Error(
            `${filename} changed after it was applied. Add a new migration instead of editing this one.`,
          );
        }
        console.log(`  ~ ${filename} (catalogue changed, re-applying)`);
      }

      process.stdout.write(`  + ${filename} ... `);
      await sql.unsafe(body);
      await sql`
        insert into erp_auth.schema_migrations (filename, checksum)
        values (${filename}, ${checksum})
        on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()
      `;
      console.log('done');
    }

    console.log(`\nSchema is up to date (${files.length} migration files).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('\nMigration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

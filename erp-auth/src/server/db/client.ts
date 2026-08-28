import 'server-only';

import postgres from 'postgres';

import { config } from '@/server/config';

/**
 * A single pooled connection for the whole server process. The `erp_auth`
 * schema is never exposed through the Supabase Data API, so this connection is
 * the only path to the credential store.
 */
declare global {
  var __erpAuthSql: postgres.Sql | undefined;
}

function createClient(): postgres.Sql {
  return postgres(config.database.url, {
    max: config.database.poolSize,
    // Required for Supabase's transaction-mode pooler (port 6543).
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    // Results come back camelCased; queries are always written explicitly.
    transform: { column: { from: postgres.toCamel } },
    connection: {
      application_name: 'erp-auth',
      statement_timeout: config.database.statementTimeoutMs,
    },
    onnotice: () => {},
  });
}

export const sql: postgres.Sql = globalThis.__erpAuthSql ?? createClient();

// Next.js dev server hot-reloads modules; without this the pool leaks.
if (!config.isProduction) {
  globalThis.__erpAuthSql = sql;
}

export type Sql = postgres.Sql;

/**
 * The query interface shared by the pool and by an open transaction. Neither
 * postgres.js type extends the other, so repositories accept both and work
 * unchanged whether or not they are called inside a transaction.
 */
export type Db = postgres.Sql | postgres.TransactionSql;

/** Runs `fn` inside a database transaction, rolling back on any throw. */
export async function withTransaction<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => fn(tx)) as Promise<T>;
}

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
  globalThis.__erpAuthSql = undefined;
}

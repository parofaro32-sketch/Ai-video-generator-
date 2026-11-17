import { PrismaClient } from '@prisma/client';
import { getJsonDb } from './json-db';

export function resolveDatabaseUrl(): string | undefined {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL_NO_SSL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.DATABASE_PRIVATE_URL,
    process.env.NEON_DATABASE_URL,
    process.env.PRISMA_DATABASE_URL,
    process.env.SUPABASE_DB_URL,
  ];
  for (const c of candidates) {
    const v = typeof c === 'string' ? c.trim() : '';
    if (v) {
      if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
        process.env.DATABASE_URL = v;
      }
      return v;
    }
  }
  return undefined;
}

const databaseUrl = resolveDatabaseUrl();

// When no Postgres URL is configured, fall back to a local JSON-backed store so
// the app (including sign-up/sign-in) works without requiring Vercel/Prisma DB setup.
// Note: on serverless (e.g. Vercel) this fallback is ephemeral across cold instances;
// configure a persistent DATABASE_URL for durable production data.
export const isUsingFallbackDb = !databaseUrl;

const globalForPrisma = globalThis as unknown as { prisma?: any };

function createPrismaClient() {
  if (isUsingFallbackDb) {
    return getJsonDb();
  }
  return new PrismaClient({
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: any = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production' || isUsingFallbackDb) globalForPrisma.prisma = prisma;

export function assertDatabaseConfigured() {
  // In fallback mode the JSON store is available; do not block.
  if (isUsingFallbackDb) return;
  if (!resolveDatabaseUrl()) {
    throw new Error(
      'Database is not configured. Set DATABASE_URL (PostgreSQL) in environment variables. On Vercel, add a Postgres database (Vercel Postgres/Neon/Supabase) and ensure DATABASE_URL or POSTGRES_PRISMA_URL is set, then run `npx prisma db push` against the database.'
    );
  }
}

export function isDatabaseConfigurationError(e: unknown): boolean {
  if (isUsingFallbackDb) return false;
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('Environment variable not found: DATABASE_URL') ||
    (msg.includes('DATABASE_URL') && msg.includes('not found')) ||
    msg.includes('Database is not configured') ||
    (msg.includes('Invalid `prisma') && msg.includes('invocation') && msg.includes('DATABASE_URL'))
  );
}

export function databaseConfigErrorResponse() {
  return {
    error: 'Database is not configured',
    details:
      'Set DATABASE_URL (PostgreSQL connection string) in your deployment environment variables. If using Vercel Postgres, connect the database to this project so POSTGRES_PRISMA_URL/DATABASE_URL are available, then run `npx prisma db push` (or migrations) to create tables. Sign-up and other data features require a configured database.',
    code: 'DATABASE_NOT_CONFIGURED',
  };
}

export default prisma;

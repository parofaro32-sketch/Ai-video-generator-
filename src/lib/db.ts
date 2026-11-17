import { PrismaClient } from '@prisma/client';

export function resolveDatabaseUrl(): string | undefined {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.NEON_DATABASE_URL;
  if (url && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = url;
  }
  return url;
}

const databaseUrl = resolveDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export function assertDatabaseConfigured() {
  if (!resolveDatabaseUrl()) {
    throw new Error(
      'Database is not configured. Set DATABASE_URL (PostgreSQL) in environment variables. On Vercel, add a Postgres database (Vercel Postgres/Neon/Supabase) and ensure DATABASE_URL or POSTGRES_PRISMA_URL is set, then run `npx prisma db push` against the database.'
    );
  }
}

export function isDatabaseConfigurationError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('Environment variable not found: DATABASE_URL') ||
    msg.includes('DATABASE_URL') && msg.includes('not found') ||
    msg.includes('Database is not configured') ||
    msg.includes('Invalid `prisma') && msg.includes('invocation') && msg.includes('DATABASE_URL')
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

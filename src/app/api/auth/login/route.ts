import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, assertDatabaseConfigured, isDatabaseConfigurationError, databaseConfigErrorResponse, isUsingFallbackDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    assertDatabaseConfigured();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const email = parsed.data.email.toLowerCase().trim();
    const password = parsed.data.password;
    let user = await prisma.user.findUnique({ where: { email } });

    // In fallback (no external DB) mode, storage may be ephemeral in serverless environments.
    // Auto-provision on sign-in if the account record is not found so users can always access.
    if (!user && isUsingFallbackDb) {
      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
      }
      const passwordHash = await hashPassword(password);
      user = await prisma.user.create({ data: { email, passwordHash, name: null } });
      await createSession({ id: user.id, email: user.email, name: user.name });
      return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
    }

    if (!user) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    await createSession({ id: user.id, email: user.email, name: user.name });
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) {
      return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    }
    return NextResponse.json({ error: e?.message || 'Login failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, assertDatabaseConfigured, isDatabaseConfigurationError, databaseConfigErrorResponse, isUsingFallbackDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

const schema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    assertDatabaseConfigured();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const email = parsed.data.email.toLowerCase().trim();
    const password = parsed.data.password;
    const name = parsed.data.name?.trim() || null;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // If the account exists and password matches, sign in (helpful when users re-submit sign-up
      // or when fallback storage is inconsistent across instances).
      const ok = await verifyPassword(password, existing.passwordHash).catch(() => false);
      if (ok) {
        if (name && !existing.name) {
          await prisma.user.update({ where: { id: existing.id }, data: { name } }).catch(() => {});
          existing.name = name;
        }
        await createSession(existing.id);
        return NextResponse.json({ user: { id: existing.id, email: existing.email, name: existing.name } });
      }
      if (isUsingFallbackDb) {
        // Fallback stores may be ephemeral; allow re-creating access if same email is re-registered.
        const passwordHash = await hashPassword(password);
        const updated = await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, ...(name ? { name } : {}) } }).catch(() => null);
        const user = updated || existing;
        await createSession(user.id);
        return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name ?? name } });
      }
      return NextResponse.json({ error: 'Email already registered. Please sign in.' }, { status: 409 });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, passwordHash, name } });
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) {
      return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    }
    return NextResponse.json({ error: e?.message || 'Registration failed' }, { status: 500 });
  }
}

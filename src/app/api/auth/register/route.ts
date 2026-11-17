import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, assertDatabaseConfigured, isDatabaseConfigurationError, databaseConfigErrorResponse } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
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
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({ data: { email, passwordHash, name: parsed.data.name?.trim() || null } });
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) {
      return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    }
    return NextResponse.json({ error: e?.message || 'Registration failed' }, { status: 500 });
  }
}

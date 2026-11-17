import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma, isDatabaseConfigurationError, isUsingFallbackDb } from '@/lib/db';

const COOKIE_NAME = 'aivg_session';
const SESSION_DAYS = 30;

function getSecret() {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SESSION_SECRET ||
    'dev-insecure-auth-secret-change-me'
  );
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url');
}

function sign(data: string) {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

type SessionPayload = {
  uid: string;
  email: string;
  name?: string | null;
  exp: number; // ms epoch
  v: 1;
};

function encodeStatelessToken(user: { id: string; email: string; name?: string | null }, expiresAt: Date) {
  const payload: SessionPayload = {
    uid: user.id,
    email: user.email,
    name: user.name ?? null,
    exp: expiresAt.getTime(),
    v: 1,
  };
  const body = base64url(JSON.stringify(payload));
  const sig = sign(body);
  return `v1.${body}.${sig}`;
}

function decodeStatelessToken(token: string): SessionPayload | null {
  try {
    if (!token.startsWith('v1.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const body = parts[1];
    const sig = parts[2];
    const expected = sign(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload || payload.v !== 1) return null;
    if (!payload.uid || !payload.email || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function payloadToUser(p: SessionPayload) {
  return { id: p.uid, email: p.email, name: p.name ?? null };
}

export async function createSession(user: { id: string; email: string; name?: string | null } | string) {
  const userId = typeof user === 'string' ? user : user.id;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  // Resolve user info for stateless token (works across serverless instances without shared DB)
  let userInfo: { id: string; email: string; name?: string | null } | null = null;
  if (typeof user === 'object' && user && user.email) {
    userInfo = { id: user.id, email: user.email, name: user.name ?? null };
  } else {
    try {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      if (u) userInfo = { id: u.id, email: u.email, name: u.name ?? null };
    } catch {}
  }

  // Best-effort DB-backed session (for persistent DB setups / legacy tokens)
  const legacyToken = crypto.randomBytes(32).toString('hex');
  try {
    await prisma.session.create({
      data: { userId, tokenHash: hashToken(legacyToken), expiresAt },
    });
  } catch {
    // ignore in fallback/ephemeral environments
  }

  // Prefer stateless token cookie so auth works even when server-side session storage is ephemeral.
  // Fallback to legacy token if user info unavailable.
  const cookieValue = userInfo ? encodeStatelessToken(userInfo, expiresAt) : legacyToken;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    // Try to delete legacy DB session if this is a legacy token
    if (!token.startsWith('v1.')) {
      const tokenHash = hashToken(token);
      await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => {});
    } else {
      // Best effort: also clean up any legacy sessions for this user in persistent DB mode
      const payload = decodeStatelessToken(token);
      if (payload && !isUsingFallbackDb) {
        await prisma.session.deleteMany({ where: { userId: payload.uid } }).catch(() => {});
      }
    }
  }
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    // 1) Stateless token (works without shared server-side session storage)
    const payload = decodeStatelessToken(token);
    if (payload) {
      // In persistent DB mode, prefer fresh user record if available
      if (!isUsingFallbackDb) {
        try {
          const u = await prisma.user.findUnique({ where: { id: payload.uid } });
          if (u) return { id: u.id, email: u.email, name: u.name };
        } catch {
          // fall back to token payload
        }
      }
      return payloadToUser(payload);
    }

    // 2) Legacy DB-backed session token
    const tokenHash = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }
    return session.user;
  } catch (e) {
    if (isDatabaseConfigurationError(e)) return null;
    // As a last resort, try stateless decode even if DB access failed unexpectedly
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get(COOKIE_NAME)?.value;
      if (token) {
        const payload = decodeStatelessToken(token);
        if (payload) return payloadToUser(payload);
      }
    } catch {}
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

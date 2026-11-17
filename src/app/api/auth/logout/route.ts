import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth/session';

export async function POST() {
  try {
    await deleteSession();
    return NextResponse.json({ ok: true });
  } catch {
    // best-effort logout (clear cookie even if DB unavailable)
    return NextResponse.json({ ok: true });
  }
}

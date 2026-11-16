import { NextResponse } from 'next/server';
import { getCurrentUser } from './session';

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  }
  return { user, response: null } as const;
}

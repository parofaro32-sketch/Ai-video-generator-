import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { isDatabaseConfigurationError, databaseConfigErrorResponse } from '@/lib/db';
import { getJobForUser, processJobUntilSettledOrTimeout } from '@/lib/jobs/service';

export async function GET(_req: Request, ctx: any) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const { id } = await ctx.params;
    const tick = await processJobUntilSettledOrTimeout(id, user.id, 12000).catch(() => null);
    const job = tick || await getJobForUser(id, user.id);
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    return NextResponse.json({ error: e?.message || 'Failed to fetch job' }, { status: 500 });
  }
}

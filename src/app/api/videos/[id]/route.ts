import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { prisma, isDatabaseConfigurationError, databaseConfigErrorResponse } from '@/lib/db';
import { getStorage } from '@/lib/storage';

export async function DELETE(_req: Request, ctx: any) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const { id } = await ctx.params;
    const video = await prisma.video.findFirst({ where: { id, userId: user.id } });
    if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.video.update({ where: { id }, data: { deletedAt: new Date() } });
    // best-effort storage delete for local; vercel blob delete by key needs URL - we have storageUrl
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN && video.storageUrl) {
        const { del } = await import('@vercel/blob');
        await del(video.storageUrl);
      } else {
        await getStorage().delete(video.storageKey);
      }
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 });
  }
}

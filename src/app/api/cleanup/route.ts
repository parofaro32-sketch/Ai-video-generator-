import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const setting = await prisma.cleanupSetting.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ setting: setting || { autoDeleteDays: null, keepFailedJobs: true } });
}

export async function POST(req: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const body = await req.json().catch(() => ({}));
    const autoDeleteDays = body.autoDeleteDays == null ? null : Math.max(1, Math.min(365, Number(body.autoDeleteDays) || 30));
    const keepFailedJobs = body.keepFailedJobs !== false;
    const setting = await prisma.cleanupSetting.upsert({
      where: { userId: user.id },
      create: { userId: user.id, autoDeleteDays, keepFailedJobs },
      update: { autoDeleteDays, keepFailedJobs },
    });
    // perform cleanup if requested
    if (autoDeleteDays) {
      const cutoff = new Date(Date.now() - autoDeleteDays * 24 * 60 * 60 * 1000);
      await prisma.video.updateMany({ where: { userId: user.id, createdAt: { lt: cutoff }, deletedAt: null }, data: { deletedAt: new Date() } });
      if (!keepFailedJobs) {
        await prisma.generationJob.deleteMany({ where: { userId: user.id, status: 'failed', createdAt: { lt: cutoff } } });
      }
    }
    return NextResponse.json({ setting, cleaned: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Cleanup failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { prisma, isDatabaseConfigurationError, databaseConfigErrorResponse } from '@/lib/db';

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response!;
  try {
    const videos = await prisma.video.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
    return NextResponse.json({ videos });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    return NextResponse.json({ error: e?.message || 'Failed to load videos' }, { status: 500 });
  }
}

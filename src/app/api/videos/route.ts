import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const videos = await prisma.video.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ videos });
}

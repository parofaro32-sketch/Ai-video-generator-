import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guards';
import { prisma, isDatabaseConfigurationError, databaseConfigErrorResponse } from '@/lib/db';

const schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  basePrompt: z.string().max(4000).optional(),
  styleNotes: z.string().max(2000).optional(),
});

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const projects = await prisma.videoProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: { videos: { where: { deletedAt: null }, orderBy: [{ sceneIndex: 'asc' }, { createdAt: 'asc' }] }, jobs: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
    return NextResponse.json({ projects });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    return NextResponse.json({ error: e?.message || 'Failed to load projects' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const project = await prisma.videoProject.create({ data: { userId: user.id, ...parsed.data } });
    return NextResponse.json({ project });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) return NextResponse.json(databaseConfigErrorResponse(), { status: 503 });
    return NextResponse.json({ error: e?.message || 'Failed to create project' }, { status: 500 });
  }
}

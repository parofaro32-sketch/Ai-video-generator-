import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guards';
import { createGenerationJob, processJobUntilSettledOrTimeout } from '@/lib/jobs/service';

const schema = z.object({
  type: z.enum(['text_to_video', 'image_to_video']),
  prompt: z.string().min(1).max(4000),
  negativePrompt: z.string().max(2000).optional(),
  imageInputUrl: z.string().min(1).max(2000).optional().or(z.literal('')),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  durationSec: z.number().min(0.3).max(30).optional(),
  resolution: z.string().max(50).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  enhancePrompt: z.boolean().optional(),
  requestedModelKey: z.string().max(100).optional(),
  projectId: z.string().optional(),
  sceneIndex: z.number().int().min(0).max(1000).optional(),
});

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const { prisma } = await import('@/lib/db');
  const jobs = await prisma.generationJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { outputVideo: true },
  });
  return NextResponse.json({ jobs });
}

export async function POST(req: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    const { job, duplicate } = await createGenerationJob({
      userId: user.id,
      type: parsed.data.type,
      prompt: parsed.data.prompt,
      negativePrompt: parsed.data.negativePrompt,
      imageInputUrl: parsed.data.imageInputUrl || undefined,
      aspectRatio: parsed.data.aspectRatio,
      durationSec: parsed.data.durationSec,
      resolution: parsed.data.resolution,
      seed: parsed.data.seed,
      enhancePrompt: parsed.data.enhancePrompt,
      requestedModelKey: parsed.data.requestedModelKey,
      projectId: parsed.data.projectId,
      sceneIndex: parsed.data.sceneIndex,
    });
    // try to advance immediately for responsiveness
    const updated = await processJobUntilSettledOrTimeout(job.id, user.id, 15000).catch(() => null);
    return NextResponse.json({ job: updated || job, duplicate });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create job' }, { status: 500 });
  }
}

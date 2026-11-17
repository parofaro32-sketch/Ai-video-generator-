import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guards';

const schema = z.object({ prompt: z.string().min(1).max(4000), type: z.enum(['text_to_video', 'image_to_video']).optional() });

function enhance(prompt: string, type?: string) {
  const p = prompt.trim().replace(/\s+/g, ' ');
  if (!p) return p;
  const hasCinematic = /cinematic|film|movie/i.test(p);
  const hasLighting = /lighting|light|glow|shadow/i.test(p);
  const hasQuality = /high quality|detailed|4k|8k|sharp/i.test(p);
  const parts = [p];
  if (!hasCinematic) parts.push('cinematic composition');
  if (!hasLighting) parts.push('natural lighting, balanced exposure');
  if (!hasQuality) parts.push('highly detailed, sharp focus');
  parts.push('smooth motion, coherent scene');
  if (type === 'image_to_video') parts.push('preserve subject identity and composition from the input image');
  return parts.filter(Boolean).join(', ');
}

export async function POST(req: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    const enhanced = enhance(parsed.data.prompt, parsed.data.type);
    return NextResponse.json({ enhancedPrompt: enhanced, method: 'heuristic-local', note: 'Locally enhanced prompt (deterministic text expansion), not an external AI model call.' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to enhance prompt' }, { status: 500 });
  }
}

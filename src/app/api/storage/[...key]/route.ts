import { NextResponse } from 'next/server';
import path from 'path';
import { readLocalStorage, isLocalStorage } from '@/lib/storage';

export async function GET(_req: Request, ctx: any) {
  try {
    if (!isLocalStorage()) {
      return NextResponse.json({ error: 'Local storage not enabled' }, { status: 404 });
    }
    const params = await ctx.params;
    const keyParts = params?.key as string[] | undefined;
    if (!keyParts || keyParts.length === 0) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    const key = keyParts.join('/');
    const normalized = path.posix.normalize(key);
    if (normalized.startsWith('..') || normalized.includes('/../')) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }
    const buf = await readLocalStorage(normalized);
    if (!buf) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const ext = path.extname(normalized).toLowerCase();
    const type = ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : ext === '.gif' ? 'image/gif' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
    return new NextResponse(buf as any, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Storage read failed' }, { status: 500 });
  }
}

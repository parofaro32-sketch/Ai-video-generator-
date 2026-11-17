import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { getStorage, makeStorageKey } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function detectImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { mime: 'image/gif', ext: 'gif' };
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export async function POST(req: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response!;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'File is required' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 400 });
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const detected = detectImage(buf);
    if (!detected) return NextResponse.json({ error: 'Invalid or unsupported image content. Use PNG, JPEG, WEBP, or GIF.' }, { status: 400 });
    const declaredOk = ALLOWED.has(file.type);
    if (!declaredOk && !ALLOWED.has(detected.mime)) return NextResponse.json({ error: 'Unsupported image type. Use PNG, JPEG, WEBP, or GIF.' }, { status: 400 });
    const key = makeStorageKey(`uploads/${user.id}`, detected.ext);
    const stored = await getStorage().put(key, buf, detected.mime);
    return NextResponse.json({ url: stored.url, key: stored.key, size: stored.sizeBytes ?? buf.length, mimeType: stored.contentType || detected.mime });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 });
  }
}

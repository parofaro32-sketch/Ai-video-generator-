import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { getStorage, makeStorageKey } from '@/lib/storage';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function POST(req: Request) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'File is required' }, { status: 400 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'Unsupported image type. Use PNG, JPEG, WEBP, or GIF.' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 400 });
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    // basic magic-byte validation
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    const isWebp = buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
    if (!isPng && !isJpg && !isGif && !isWebp) return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const key = makeStorageKey(`uploads/${user.id}`, ext);
    const stored = await getStorage().put(key, buf, file.type);
    return NextResponse.json({ url: stored.url, key: stored.key, size: buf.length, mimeType: file.type });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 });
  }
}

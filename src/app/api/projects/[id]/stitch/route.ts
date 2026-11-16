import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getStorage, makeStorageKey, readLocalStorage, downloadToBuffer } from '@/lib/storage';

const execFileAsync = promisify(execFile);

async function hasFfmpeg() {
  try { await execFileAsync('ffmpeg', ['-version']); return true; } catch { return false; }
}

export async function POST(_req: Request, ctx: any) {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  try {
    const { id } = await ctx.params;
    const project = await prisma.videoProject.findFirst({
      where: { id, userId: user.id },
      include: { videos: { where: { deletedAt: null }, orderBy: [{ sceneIndex: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (project.videos.length < 2) return NextResponse.json({ error: 'At least two completed scene videos are required to stitch.' }, { status: 400 });
    if (!(await hasFfmpeg())) {
      return NextResponse.json({ error: 'FFmpeg is not available in this environment. Scene clips are stored individually and can be downloaded separately.', available: false }, { status: 501 });
    }
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-'));
    try {
      const inputs: string[] = [];
      for (let i = 0; i < project.videos.length; i++) {
        const v = project.videos[i];
        const ext = v.mimeType.includes('webm') ? 'webm' : 'mp4';
        const filePath = path.join(tmp, `scene_${i}.${ext}`);
        if (v.storageUrl.startsWith('/api/storage/')) {
          const key = v.storageUrl.replace(/^\/api\/storage\//, '');
          const buf = await readLocalStorage(key);
          if (!buf) throw new Error(`Missing local file for scene ${i + 1}`);
          await fs.writeFile(filePath, buf);
        } else {
          const { buffer } = await downloadToBuffer(v.storageUrl);
          await fs.writeFile(filePath, buffer);
        }
        inputs.push(filePath);
      }
      const listPath = path.join(tmp, 'list.txt');
      await fs.writeFile(listPath, inputs.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
      const outPath = path.join(tmp, 'combined.mp4');
      try {
        await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath], { timeout: 120000 });
      } catch {
        const args = ['-y'];
        for (const inp of inputs) { args.push('-i', inp); }
        const vconcat = inputs.map((_, i) => `[v${i}]`).join('') + `concat=n=${inputs.length}:v=1:a=0[outv]`;
        await execFileAsync('ffmpeg', [...args, '-filter_complex', `${inputs.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS[v${i}]`).join(';')};${vconcat}`, '-map', '[outv]', '-pix_fmt', 'yuv420p', outPath], { timeout: 180000 });
      }
      const outBuf = await fs.readFile(outPath);
      const storage = getStorage();
      const key = makeStorageKey(`projects/${user.id}`, 'mp4');
      const stored = await storage.put(key, outBuf, 'video/mp4');
      return NextResponse.json({ ok: true, combined: { url: stored.url, key: stored.key, size: outBuf.length }, scenes: project.videos.length });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Stitch failed' }, { status: 500 });
  }
}

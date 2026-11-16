'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Trash2 } from 'lucide-react';

export default function MyVideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/videos', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load videos');
      setVideos(data.videos || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm('Delete this video from your library?')) return;
    const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
    if (res.ok) setVideos(v => v.filter(x => x.id !== id));
  }

  if (error && /unauthorized/i.test(error)) {
    return <div className="container-page"><div className="glass card p-8 mt-8"><h1 className="page-title">My Videos</h1><p className="page-sub mt-2">Sign in to view and manage your generated videos.</p><div className="mt-4 flex gap-3"><Link href="/login" className="btn btn-primary">Sign in</Link></div></div></div>;
  }

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">My Videos</h1>
          <p className="page-sub">Your stored generation outputs with prompt, model, timestamps, and downloads.</p>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      {loading ? <div className="mt-8 text-[var(--muted)]">Loading videos…</div> : error ? <div className="mt-6 text-red-300">{error}</div> : (
        <div className="mt-6 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {videos.length === 0 && <div className="glass card p-6 text-[var(--muted)] col-span-full">No videos yet. Completed generations will appear here.</div>}
          {videos.map(v => (
            <div key={v.id} className="glass card overflow-hidden flex flex-col">
              <div className="aspect-video bg-black/50 border-b border-[var(--border)]">
                {v.storageUrl ? <video src={v.storageUrl} className="w-full h-full object-cover" controls preload="metadata" /> : <div className="w-full h-full flex items-center justify-center text-[var(--muted)] text-sm">No preview</div>}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-sm line-clamp-3">{v.prompt}</p>
                <div className="mt-2 text-xs text-[var(--muted)] space-y-1">
                  <div>{new Date(v.createdAt).toLocaleString()}</div>
                  <div>{v.type?.replace(/_/g,' ')} · {v.modelKey || v.providerKey || 'model n/a'} · {v.aspectRatio?.replace('ratio_','').replace('_',':')}</div>
                  {v.seed != null && <div>Seed: {v.seed}</div>}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {v.storageUrl && <a href={v.storageUrl} download className="btn btn-primary text-sm py-2 flex-1"><Download className="h-4 w-4" /> Download</a>}
                  <button onClick={() => remove(v.id)} className="btn btn-danger text-sm py-2 px-3" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ImagePlus, Wand2, Loader2, AlertCircle, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';

type Model = {
  key: string;
  providerKey: string;
  name: string;
  providerName: string;
  capabilities: any;
  spaceUrl: string;
  documentedQuota?: string;
  notes?: string[];
};

export default function GeneratePage() {
  const [me, setMe] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [type, setType] = useState<'text_to_video' | 'image_to_video'>('text_to_video');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [durationSec, setDurationSec] = useState<number>(2);
  const [seed, setSeed] = useState<string>('');
  const [requestedModelKey, setRequestedModelKey] = useState<string>('auto');
  const [enhancePrompt, setEnhancePrompt] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string>('');
  const [job, setJob] = useState<any>(null);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setMe(d.user)).finally(() => setAuthChecked(true));
    fetch('/api/providers').then(r => r.json()).then(d => setModels(d.models || [])).catch(() => {});
  }, []);

  const compatibleModels = useMemo(() => models.filter(m => type === 'text_to_video' ? m.capabilities?.textToVideo : m.capabilities?.imageToVideo), [models, type]);
  const selectedModel = compatibleModels.find(m => m.key === requestedModelKey || m.providerKey === requestedModelKey);
  const caps = selectedModel?.capabilities || null;

  useEffect(() => {
    // reset model selection if incompatible
    if (requestedModelKey !== 'auto' && selectedModel == null && compatibleModels.length > 0) {
      // keep auto; do nothing, but UI will show auto
    }
  }, [type, compatibleModels, requestedModelKey, selectedModel]);

  useEffect(() => {
    if (!job?.id) return;
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`, { cache: 'no-store' });
        const data = await res.json();
        if (res.ok && data.job) setJob(data.job);
      } catch {}
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [job?.id, job?.status]);

  async function doEnhance() {
    if (!prompt.trim()) return;
    setEnhancing(true);
    try {
      const res = await fetch('/api/enhance-prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, type }) });
      const data = await res.json();
      if (res.ok && data.enhancedPrompt) setPrompt(data.enhancedPrompt);
      else throw new Error(data.error || 'Enhancement failed');
    } catch (e: any) { setError(e.message); }
    finally { setEnhancing(false); }
  }

  async function ensureUploadedImage(): Promise<string | undefined> {
    if (imageUrl) return imageUrl;
    if (!imageFile) return undefined;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', imageFile);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setImageUrl(data.url);
      return data.url as string;
    } finally { setUploading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setJob(null);
    if (!me) { setError('Please sign in to generate videos.'); return; }
    if (!prompt.trim()) { setError('Prompt is required.'); return; }
    if (type === 'image_to_video' && !imageFile && !imageUrl) { setError('Please upload an input image for image-to-video.'); return; }
    setSubmitting(true);
    try {
      let finalImageUrl = undefined as string | undefined;
      if (type === 'image_to_video') finalImageUrl = await ensureUploadedImage();
      const body: any = {
        type,
        prompt,
        negativePrompt: negativePrompt || undefined,
        imageInputUrl: finalImageUrl,
        aspectRatio,
        durationSec: Number(durationSec) || undefined,
        seed: seed ? Number(seed) : undefined,
        enhancePrompt,
        requestedModelKey: requestedModelKey === 'auto' ? undefined : requestedModelKey,
      };
      const res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create job');
      setJob(data.job);
    } catch (e: any) {
      setError(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (authChecked && !me) {
    return (
      <div className="container-page max-w-3xl">
        <div className="glass card p-8 mt-8">
          <h1 className="page-title">Generate video</h1>
          <p className="page-sub mt-2">You need an account to submit generation jobs, track progress, and store results.</p>
          <div className="mt-5 flex gap-3"><Link href="/login" className="btn btn-primary">Sign in</Link><Link href="/register" className="btn">Create account</Link></div>
        </div>
      </div>
    );
  }

  const videoUrl = job?.outputVideo?.storageUrl;

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Generate</h1>
          <p className="page-sub">Text-to-video and image-to-video with automatic free-provider routing and fallback. Real provider results only.</p>
        </div>
        <Link href="/usage" className="btn text-sm"><RefreshCw className="h-4 w-4" /> Provider status</Link>
      </div>

      <div className="mt-6 grid lg:grid-cols-[1.1fr_.9fr] gap-6">
        <form onSubmit={submit} className="glass card p-5 sm:p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => setType('text_to_video')} className={`p-4 rounded-xl border text-left transition ${type === 'text_to_video' ? 'border-[#7c5cff] bg-[#7c5cff]/10' : 'border-[var(--border)] bg-white/2 hover:bg-white/5'}`}>
              <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#22d3ee]" /> Text to Video</div>
              <div className="text-sm text-[var(--muted)] mt-1">Generate motion from a written prompt.</div>
            </button>
            <button type="button" onClick={() => setType('image_to_video')} className={`p-4 rounded-xl border text-left transition ${type === 'image_to_video' ? 'border-[#7c5cff] bg-[#7c5cff]/10' : 'border-[var(--border)] bg-white/2 hover:bg-white/5'}`}>
              <div className="font-semibold flex items-center gap-2"><ImagePlus className="h-4 w-4 text-[#22d3ee]" /> Image to Video</div>
              <div className="text-sm text-[var(--muted)] mt-1">Animate an uploaded source image.</div>
            </button>
          </div>

          {type === 'image_to_video' && (
            <div>
              <label className="label">Input image</label>
              <input className="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { setImageFile(e.target.files?.[0] || null); setImageUrl(''); }} />
              <p className="text-xs text-[var(--muted)] mt-1">PNG, JPEG, WEBP, GIF up to 10MB. Uploaded securely to storage and sent to a compatible provider.</p>
              {imageUrl && <p className="text-xs text-emerald-300 mt-1">Image uploaded.</p>}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="label mb-0">Prompt</label>
              <button type="button" onClick={doEnhance} disabled={enhancing || !prompt.trim()} className="text-xs btn py-1.5 px-2.5"><Wand2 className="h-3.5 w-3.5" />{enhancing ? 'Enhancing…' : 'Enhance prompt'}</button>
            </div>
            <textarea className="textarea min-h-[140px]" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={type === 'text_to_video' ? 'A cinematic aerial shot of waves crashing against neon-lit cliffs at dusk, volumetric fog, smooth camera motion' : 'Describe how the input image should animate (camera motion, subject motion, atmosphere)…'} required />
            <p className="text-xs text-[var(--muted)] mt-1">Enhancement is a local deterministic prompt expansion (not an external AI call) to add detail and motion cues.</p>
          </div>

          <div>
            <label className="label">Negative prompt {caps && caps.negativePrompt === false ? '(not supported by selected model; may be ignored)' : '(when supported)'}</label>
            <textarea className="textarea min-h-[80px]" value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} placeholder="blurry, distorted, jittery motion, artifacts" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Model selection</label>
              <select className="select" value={requestedModelKey} onChange={e => setRequestedModelKey(e.target.value)}>
                <option value="auto">Automatic (recommended) — route across compatible free providers</option>
                {compatibleModels.map(m => (
                  <option key={m.key} value={m.key}>{m.name} — {m.providerName}</option>
                ))}
              </select>
              <p className="text-xs text-[var(--muted)] mt-1">If a selected/compatible provider fails, routing falls back to other compatible providers automatically.</p>
            </div>
            <div>
              <label className="label">Aspect ratio</label>
              <select className="select" value={aspectRatio} onChange={e => setAspectRatio(e.target.value as any)}>
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                <option value="1:1">1:1 (Square)</option>
              </select>
            </div>
            <div>
              <label className="label">Duration (seconds, model-dependent)</label>
              <input className="input" type="number" min={0.3} max={30} step={0.1} value={durationSec} onChange={e => setDurationSec(Number(e.target.value))} />
              <p className="text-xs text-[var(--muted)] mt-1">Actual supported range depends on selected provider/model (many free models produce short clips).</p>
            </div>
            <div>
              <label className="label">Seed (optional, when supported)</label>
              <input className="input" type="number" min={0} step={1} value={seed} onChange={e => setSeed(e.target.value)} placeholder="Random if empty" />
            </div>
          </div>

          <div className="text-xs text-[var(--muted)] bg-white/3 border border-[var(--border)] rounded-lg p-3">
            <strong className="text-[var(--text)]">Capabilities note:</strong> Resolution, duration, seed, negative prompt, and queue estimates are only available when supported/exposed by the active provider. Unsupported options may be ignored by a model; the app does not claim unsupported capabilities.
          </div>

          {error && <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}

          <button className="btn btn-primary w-full py-3 text-base" disabled={submitting || uploading}>
            {submitting || uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploading ? 'Uploading image…' : 'Submitting job…'}</> : <><Sparkles className="h-4 w-4" /> Generate video</>}
          </button>
        </form>

        <div className="space-y-4">
          <div className="glass card p-5 sm:p-6">
            <h2 className="font-semibold text-lg">Job status</h2>
            {!job ? (
              <p className="text-[var(--muted)] mt-2 text-sm">Submit a prompt to create a real generation job. Progress and provider routing details will appear here.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={job.status} />
                  <span className="text-xs text-[var(--muted)]">Job {job.id}</span>
                  {job.duplicate && <span className="badge badge-info">duplicate prevented / reused active job context</span>}
                </div>
                <div className="text-sm space-y-1">
                  <div><span className="text-[var(--muted)]">Provider:</span> {job.providerKey || 'Selecting…'}</div>
                  <div><span className="text-[var(--muted)]">Model:</span> {job.modelKey || job.requestedModelKey || 'Automatic'}</div>
                  <div><span className="text-[var(--muted)]">Progress:</span> {job.progress != null ? `${Math.round(job.progress * 100)}%` : '—'} {job.progressMessage ? `· ${job.progressMessage}` : ''}</div>
                  <div><span className="text-[var(--muted)]">Queue position:</span> {job.queuePosition ?? 'Not provided by provider'}</div>
                  <div><span className="text-[var(--muted)]">Estimated wait:</span> {job.estimatedWaitSec != null ? `${job.estimatedWaitSec}s (provider-reported)` : 'Not provided by provider'}</div>
                </div>
                {job.lastError && job.status !== 'succeeded' && (
                  <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    <div className="font-medium">Last provider/error note</div>
                    <div className="mt-0.5 text-amber-100/90 break-words">{job.lastError}</div>
                  </div>
                )}
                {job.status === 'failed' && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex gap-2"><AlertCircle className="h-4 w-4 mt-0.5" /><div>Generation failed after routing/fallback attempts. Try again later or choose a different compatible model when available.</div></div>
                )}
                {job.status === 'succeeded' && videoUrl && (
                  <div className="space-y-3">
                    <div className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Generation completed</div>
                    <video src={videoUrl} controls className="w-full rounded-xl border border-[var(--border)] bg-black" />
                    <div className="flex flex-wrap gap-2">
                      <a href={videoUrl} download className="btn btn-primary"><Download className="h-4 w-4" /> Download video</a>
                      <Link href="/my-videos" className="btn">My videos</Link>
                    </div>
                  </div>
                )}
                {['queued','submitting','running'].includes(job.status) && (
                  <div className="text-xs text-[var(--muted)]">Polling status every 4s. Provider queues can take minutes on free tiers; this page advances job state when polled.</div>
                )}
              </div>
            )}
          </div>

          <div className="glass card p-5">
            <h3 className="font-semibold">Longer video workflow (scene-based)</h3>
            <p className="text-sm text-[var(--muted)] mt-1">Most free models generate short clips. Use consistent scene prompts/settings and generate subsequent scenes as separate jobs, then download clips. FFmpeg-based stitching is environment-dependent on Vercel serverless; scene history and prompts are preserved for continuity.</p>
            <Link href="/history" className="inline-flex mt-3 text-sm text-[#22d3ee] hover:underline">Open generation history →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

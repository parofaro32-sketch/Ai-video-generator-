'use client';

import { useEffect, useState } from 'react';
import { Cpu, ExternalLink, CheckCircle2, XCircle } from 'lucide-react';

export default function ModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [status, setStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/providers').then(r => r.json()).catch(() => ({ models: [] })),
      fetch('/api/providers/status').then(r => r.json()).catch(() => ({ providers: [] })),
    ]).then(([m, s]) => {
      setModels(m.models || []);
      setStatus(s.providers || []);
    }).finally(() => setLoading(false));
  }, []);

  const byKey = new Map(status.map((p: any) => [p.providerKey, p]));

  return (
    <div className="container-page">
      <h1 className="page-title">Explore Models</h1>
      <p className="page-sub">Configured open-source video models and their integrated provider adapters. Availability reflects live/public endpoint checks and recent job outcomes where available.</p>

      {loading ? <div className="mt-8 text-[var(--muted)]">Loading models…</div> : (
        <div className="mt-8 grid lg:grid-cols-2 gap-4">
          {models.map((m) => {
            const st = byKey.get(m.providerKey) || {};
            const caps = m.capabilities || {};
            return (
              <div key={`${m.key}-${m.providerKey}`} className="glass card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Cpu className="h-5 w-5 text-[#22d3ee]" />
                      <h2 className="text-xl font-semibold">{m.name}</h2>
                    </div>
                    <p className="text-sm text-[var(--muted)] mt-1">{m.providerName}</p>
                  </div>
                  <div className="text-xs">
                    {st.available === true ? <span className="badge badge-success"><CheckCircle2 className="h-3.5 w-3.5" /> Available</span> : st.available === false ? <span className="badge badge-danger"><XCircle className="h-3.5 w-3.5" /> Unavailable</span> : <span className="badge">Unknown</span>}
                  </div>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-[var(--muted)]">Text-to-video:</span> {caps.textToVideo ? 'Supported' : 'Not supported'}</div>
                  <div><span className="text-[var(--muted)]">Image-to-video:</span> {caps.imageToVideo ? 'Supported' : 'Not supported'}</div>
                  <div><span className="text-[var(--muted)]">Negative prompt:</span> {caps.negativePrompt ? 'Supported' : 'Not exposed'}</div>
                  <div><span className="text-[var(--muted)]">Seed:</span> {caps.seed ? 'Supported' : 'Not exposed'}</div>
                  <div><span className="text-[var(--muted)]">Aspect ratios:</span> {(caps.aspectRatios || []).join(', ') || 'Provider default'}</div>
                  <div><span className="text-[var(--muted)]">Duration:</span> {caps.minDurationSec != null || caps.maxDurationSec != null ? `${caps.minDurationSec ?? '?'}–${caps.maxDurationSec ?? '?'}s` : 'Model/provider dependent'}</div>
                </div>
                {caps.resolutions?.length ? <div className="mt-3 text-sm"><span className="text-[var(--muted)]">Resolutions:</span> {caps.resolutions.join(', ')}</div> : null}
                <div className="mt-3 text-sm"><span className="text-[var(--muted)]">Documented free quota:</span> {m.documentedQuota || 'Dynamic/community-managed; not guaranteed'}</div>
                {caps.notes?.length ? <ul className="mt-3 text-sm text-[var(--muted)] list-disc pl-5 space-y-1">{caps.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul> : null}
                {m.notes?.length ? <ul className="mt-2 text-xs text-[var(--muted)] list-disc pl-5 space-y-1">{m.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul> : null}
                <div className="mt-4 flex items-center gap-3 text-sm">
                  <a href={m.spaceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#22d3ee] hover:underline"><ExternalLink className="h-4 w-4" /> Provider endpoint</a>
                  {st.lastSuccessAt && <span className="text-[var(--muted)]">Last success: {new Date(st.lastSuccessAt).toLocaleString()}</span>}
                </div>
              </div>
            );
          })}
          {models.length === 0 && <div className="glass card p-6 text-[var(--muted)]">No models configured.</div>}
        </div>
      )}

      <div className="mt-8 glass card p-5 text-sm text-[var(--muted)]">
        <h3 className="font-semibold text-[var(--text)] mb-2">Investigated / planned model families</h3>
        <p>The spec targets Wan 2.1/2.2, LTX-Video/LTX-2, CogVideoX, HunyuanVideo, Mochi, Stable Video Diffusion and other open-weight models. Only endpoints with verified, legitimate public/free inference access and compatible APIs are integrated as working adapters. Unavailable or unverified endpoints are not counted as usable capacity and are reported clearly in Usage & Status.</p>
      </div>
    </div>
  );
}

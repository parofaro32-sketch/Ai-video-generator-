'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';

export default function UsagePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`/api/providers/status${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(false); }, []);

  const providers = data?.providers || [];

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Usage & Provider Status</h1>
          <p className="page-sub">Live/configured provider dashboard. Documented free quotas and queue status are shown only when available from provider data or explicit documentation; unavailable providers are not counted as usable capacity.</p>
        </div>
        <button className="btn" onClick={() => load(true)} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Checking…' : 'Refresh checks'}</button>
      </div>

      {loading ? <div className="mt-8 text-[var(--muted)]">Loading provider status…</div> : (
        <>
          <div className="mt-4 text-xs text-[var(--muted)]">Observed at: {data?.at ? new Date(data.at).toLocaleString() : '—'} · {providers.filter((p:any)=>p.available===true).length} available / {providers.length} configured providers (availability is time-varying)</div>
          <div className="mt-6 grid lg:grid-cols-2 gap-4">
            {providers.map((p: any) => (
              <div key={p.providerKey} className="glass card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{p.displayName || p.providerKey}</h2>
                    <p className="text-sm text-[var(--muted)]">Model: {p.modelDisplayName || p.modelKey} <span className="text-xs">({p.providerKey})</span></p>
                  </div>
                  <StatusBadge status={p.available === true ? 'available' : p.available === false ? 'unavailable' : 'unknown'} />
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><span className="text-[var(--muted)]">Supported generation:</span> {(p.supportedTypes || []).map((t:string)=>t.replace(/_/g,' ')).join(', ') || '—'}</div>
                  <div><span className="text-[var(--muted)]">Queue status:</span> {p.queueStatus || 'Not exposed by provider API'}</div>
                  <div className="sm:col-span-2"><span className="text-[var(--muted)]">Documented free quota:</span> {p.documentedQuota || 'Community free tier (dynamic/shared); exact quota not exposed'}</div>
                  <div><span className="text-[var(--muted)]">Remaining quota:</span> {p.remainingQuota || 'Not accessible via public API'}</div>
                  <div><span className="text-[var(--muted)]">Last checked:</span> {p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleString() : 'Not yet checked'}</div>
                  <div><span className="text-[var(--muted)]">Last successful generation:</span> {p.lastSuccessAt ? new Date(p.lastSuccessAt).toLocaleString() : 'None recorded'}</div>
                  <div><span className="text-[var(--muted)]">Cooldown until:</span> {p.cooldownUntil ? new Date(p.cooldownUntil).toLocaleString() : '—'}</div>
                </div>
                {p.lastError && <div className="mt-3 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"><span className="font-medium">Current/last error:</span> <span className="break-words">{p.lastError}</span></div>}
                {p.capabilities && (
                  <div className="mt-3 text-xs text-[var(--muted)]">
                    Capabilities: T2V {p.capabilities.textToVideo ? 'yes' : 'no'}, I2V {p.capabilities.imageToVideo ? 'yes' : 'no'}, neg prompt {p.capabilities.negativePrompt ? 'yes' : 'n/a'}, seed {p.capabilities.seed ? 'yes' : 'n/a'}, aspect {(p.capabilities.aspectRatios||[]).join('/') || 'default'}
                  </div>
                )}
                {p.spaceUrl && <a href={p.spaceUrl} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-[#22d3ee] hover:underline">Open provider endpoint</a>}
              </div>
            ))}
            {providers.length === 0 && <div className="glass card p-6 text-[var(--muted)]">No providers configured.</div>}
          </div>

          <div className="mt-8 glass card p-5 text-sm text-[var(--muted)] space-y-2">
            <h3 className="font-semibold text-[var(--text)]">Routing & quota policy</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>The router prioritizes genuinely free, compatible, and available providers and applies cooldowns after failures/rate limits.</li>
              <li>Automatic fallback retries other compatible endpoints while preserving the original prompt and settings.</li>
              <li>Documented free quotas are shown when published; remaining quota is shown only if accessible via API (most public Spaces do not expose it).</li>
              <li>Different Spaces may share underlying quotas or hardware pools; the system does not assume independent quotas and does not describe capacity as unlimited.</li>
              <li>Unavailable providers are reported and excluded from usable capacity until healthy.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

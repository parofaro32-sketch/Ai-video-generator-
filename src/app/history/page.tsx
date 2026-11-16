'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';

export default function HistoryPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load history');
      setJobs(data.jobs || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (error && /unauthorized/i.test(error)) {
    return <div className="container-page"><div className="glass card p-8 mt-8"><h1 className="page-title">Generation History</h1><p className="page-sub mt-2">Sign in to view your generation history.</p><div className="mt-4 flex gap-3"><Link href="/login" className="btn btn-primary">Sign in</Link><Link href="/register" className="btn">Register</Link></div></div></div>;
  }

  return (
    <div className="container-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Generation History</h1>
          <p className="page-sub">Persistent job records including prompt, model/provider, timestamps, status, and outputs when available.</p>
        </div>
        <button className="btn" onClick={load}>Refresh</button>
      </div>
      {loading ? <div className="mt-8 text-[var(--muted)]">Loading history…</div> : error ? <div className="mt-6 text-red-300">{error}</div> : (
        <div className="mt-6 space-y-3">
          {jobs.length === 0 && <div className="glass card p-6 text-[var(--muted)]">No generation jobs yet. <Link href="/generate" className="text-[#22d3ee] hover:underline">Start generating</Link>.</div>}
          {jobs.map(job => (
            <div key={job.id} className="glass card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={job.status} />
                  <span className="text-xs text-[var(--muted)]">{new Date(job.createdAt).toLocaleString()}</span>
                  <span className="badge">{job.type?.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">{job.providerKey || 'provider pending'} {job.modelKey ? `· ${job.modelKey}` : ''}</div>
              </div>
              <p className="mt-3 text-sm leading-relaxed"><span className="text-[var(--muted)]">Prompt:</span> {job.prompt}</p>
              {job.negativePrompt ? <p className="mt-1 text-sm text-[var(--muted)]"><span className="text-[var(--muted)]">Negative:</span> {job.negativePrompt}</p> : null}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                <span>Aspect: {job.aspectRatio?.replace('ratio_', '').replace('_', ':')}</span>
                {job.durationSeconds != null && <span>Duration: {job.durationSeconds}s</span>}
                {job.seed != null && <span>Seed: {job.seed}</span>}
                {job.queuePosition != null && <span>Queue: {job.queuePosition}</span>}
              </div>
              {job.lastError && <div className="mt-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 break-words">{job.lastError}</div>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {job.outputVideo?.storageUrl ? (
                  <>
                    <a href={job.outputVideo.storageUrl} className="btn btn-primary text-sm py-2" download>Download</a>
                    <a href={job.outputVideo.storageUrl} target="_blank" rel="noreferrer" className="text-sm text-[#22d3ee] hover:underline">Open video</a>
                  </>
                ) : null}
                <Link href={`/generate`} className="text-sm text-[var(--muted)] hover:text-white">New generation</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

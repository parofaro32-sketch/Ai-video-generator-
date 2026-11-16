'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState<any>({ autoDeleteDays: '', keepFailedJobs: true });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setMe(d.user)).finally(() => setLoading(false));
    fetch('/api/cleanup').then(r => r.json()).then(d => {
      if (d.setting) setSetting({ autoDeleteDays: d.setting.autoDeleteDays ?? '', keepFailedJobs: d.setting.keepFailedJobs ?? true });
    }).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoDeleteDays: setting.autoDeleteDays === '' ? null : Number(setting.autoDeleteDays), keepFailedJobs: !!setting.keepFailedJobs }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setMsg('Settings saved. Cleanup applied based on your configuration.');
    } catch (e: any) { setMsg(e.message); }
    finally { setSaving(false); }
  }

  if (!loading && !me) {
    return <div className="container-page max-w-3xl"><div className="glass card p-8 mt-8"><h1 className="page-title">Settings</h1><p className="page-sub mt-2">Sign in to manage account and storage cleanup settings.</p><div className="mt-4"><Link href="/login" className="btn btn-primary">Sign in</Link></div></div></div>;
  }

  return (
    <div className="container-page max-w-3xl">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Manage storage cleanup preferences and account information.</p>

      <div className="mt-6 space-y-4">
        <div className="glass card p-5">
          <h2 className="font-semibold text-lg">Account</h2>
          <div className="mt-2 text-sm text-[var(--muted)]">
            {me ? (<>
              <div><span className="text-[var(--text)]">Email:</span> {me.email}</div>
              {me.name && <div><span className="text-[var(--text)]">Name:</span> {me.name}</div>}
              <div><span className="text-[var(--text)]">User ID:</span> {me.id}</div>
            </>) : 'Loading…'}
          </div>
        </div>

        <form onSubmit={save} className="glass card p-5 space-y-4">
          <h2 className="font-semibold text-lg">Storage & cleanup</h2>
          <p className="text-sm text-[var(--muted)]">Configure automatic cleanup for stored videos. Large video files are stored outside the application database (filesystem in local dev or configured blob storage such as Vercel Blob in production).</p>
          <div>
            <label className="label">Auto-delete videos older than (days, optional)</label>
            <input className="input max-w-xs" type="number" min={1} max={365} value={setting.autoDeleteDays} onChange={e => setSetting((s: any) => ({ ...s, autoDeleteDays: e.target.value }))} placeholder="Disabled (leave empty)" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!setting.keepFailedJobs} onChange={e => setSetting((s: any) => ({ ...s, keepFailedJobs: e.target.checked }))} />
            Keep failed job records during cleanup
          </label>
          {msg && <div className="text-sm text-[var(--muted)] bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2">{msg}</div>}
          <button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save settings & run cleanup'}</button>
        </form>

        <div className="glass card p-5 text-sm text-[var(--muted)]">
          <h2 className="font-semibold text-lg text-[var(--text)]">Security & deployment notes</h2>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>API credentials (e.g. HF_TOKEN, BLOB_READ_WRITE_TOKEN, AUTH_SECRET, DATABASE_URL) must be configured server-side via environment variables and are never exposed to the browser.</li>
            <li>Generation endpoints require authentication and validate inputs. Uploaded images are type/size checked.</li>
            <li>Provider quotas, rate limits, and terms of service are respected; the system does not bypass authentication, CAPTCHA, or account limits.</li>
            <li>Set <code>DATABASE_URL</code> (PostgreSQL) and run <code>npx prisma db push</code> (or migrations) before use in a persistent environment.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      router.push('/generate');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page max-w-lg">
      <div className="glass card p-8 mt-8">
        <h1 className="page-title">Create account</h1>
        <p className="page-sub">Register to generate videos, track jobs, and keep your library.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">Name (optional)</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            <p className="text-xs text-[var(--muted)] mt-1">Minimum 8 characters.</p>
          </div>
          {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
          <button className="btn btn-primary w-full" disabled={loading} type="submit">{loading ? 'Creating account…' : 'Create account'}</button>
        </form>
        <p className="text-sm text-[var(--muted)] mt-4">Already have an account? <Link href="/login" className="text-[#22d3ee] hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Clapperboard, Cpu, History, Home, LogIn, LogOut, Sparkles, Settings, Video, Gauge } from 'lucide-react';

type Me = { id: string; email: string; name?: string | null } | null;

const nav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/generate', label: 'Generate', icon: Sparkles },
  { href: '/models', label: 'Explore Models', icon: Cpu },
  { href: '/history', label: 'History', icon: History },
  { href: '/my-videos', label: 'My Videos', icon: Video },
  { href: '/usage', label: 'Usage & Status', icon: Gauge },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (alive) setUser(d.user || null); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [pathname]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(5,7,13,0.7)] backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c5cff] to-[#22d3ee] shadow-[0_0_20px_rgba(124,92,255,0.45)]">
              <Clapperboard className="h-4 w-4 text-white" />
            </span>
            <span className="text-lg">CineForge <span className="text-[#22d3ee]">AI</span></span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1">
            {nav.map(item => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${active ? 'bg-white/10 text-white' : 'text-[var(--muted)] hover:text-white hover:bg-white/5'}`}>
                  <Icon className="h-4 w-4" />{item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {!loading && user ? (
              <>
                <span className="hidden sm:inline text-sm text-[var(--muted)] max-w-[180px] truncate" title={user.email}>{user.email}</span>
                <button onClick={logout} className="btn text-sm py-2"><LogOut className="h-4 w-4" />Logout</button>
              </>
            ) : !loading ? (
              <div className="flex gap-2">
                <Link href="/login" className="btn text-sm py-2"><LogIn className="h-4 w-4" />Sign in</Link>
                <Link href="/register" className="btn btn-primary text-sm py-2">Register</Link>
              </div>
            ) : <span className="text-sm text-[var(--muted)]">…</span>}
          </div>
        </div>
        <div className="lg:hidden border-t border-[var(--border)] overflow-x-auto">
          <nav className="flex items-center gap-1 px-2 py-2 min-w-max">
            {nav.map(item => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap ${active ? 'bg-white/10 text-white' : 'text-[var(--muted)]'}`}><Icon className="h-4 w-4" />{item.label}</Link>;
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--border)] py-6 text-center text-sm text-[var(--muted)]">
        <div className="max-w-7xl mx-auto px-4">CineForge AI — multi-model video generation using legitimate free/public inference endpoints. Availability depends on provider quotas and uptime. No paid GPU infrastructure or hidden APIs.</div>
      </footer>
    </div>
  );
}

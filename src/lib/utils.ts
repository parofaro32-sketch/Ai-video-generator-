import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeJson<T>(value: unknown, fallback: T): T {
  try {
    return value as T;
  } catch {
    return fallback;
  }
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function formatDuration(sec?: number | null) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 60) return `${sec.toFixed(sec % 1 === 0 ? 0 : 1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

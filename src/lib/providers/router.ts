import { prisma } from '@/lib/db';
import type { GenerationType, ProviderAdapter, ProviderHealthInfo } from '@/types/generation';
import { getProviderAdapters } from './registry';

const COOLDOWN_BASE_MS = 60_000; // 1 min
const COOLDOWN_MAX_MS = 30 * 60_000; // 30 min

function cooldownUntil(failures: number) {
  const ms = Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * Math.pow(2, Math.max(0, failures - 1)));
  return new Date(Date.now() + ms);
}

export async function refreshProviderHealth(provider: ProviderAdapter): Promise<ProviderHealthInfo & { providerKey: string }> {
  const health = await provider.checkAvailability();
  const quota = await provider.getQuota().catch(() => ({ documentedFreeQuota: undefined as string | undefined, remainingQuota: undefined as string | undefined, queueStatus: undefined as string | undefined, notes: [] as string[] }));
  const existing = await prisma.providerHealth.findUnique({ where: { providerKey: provider.key } });
  const failures = existing?.consecutiveFailures ?? 0;
  const quotaNotes = 'notes' in quota ? (quota.notes || []) : [];
  await prisma.providerHealth.upsert({
    where: { providerKey: provider.key },
    create: {
      providerKey: provider.key,
      modelKey: provider.modelKey,
      displayName: provider.displayName,
      available: health.available,
      supportedTypes: [
        ...(provider.getCapabilities().textToVideo ? ['text_to_video'] : []),
        ...(provider.getCapabilities().imageToVideo ? ['image_to_video'] : []),
      ],
      documentedQuota: quota.documentedFreeQuota,
      remainingQuota: quota.remainingQuota,
      queueStatus: quota.queueStatus ?? health.status,
      lastCheckedAt: new Date(health.checkedAt),
      lastSuccessAt: existing?.lastSuccessAt,
      lastErrorAt: health.available ? existing?.lastErrorAt : new Date(),
      lastError: health.error || (health.available ? null : health.message || 'Unavailable'),
      consecutiveFailures: health.available ? 0 : failures,
      metadata: { quotaNotes, homepage: provider.homepage },
    },
    update: {
      modelKey: provider.modelKey,
      displayName: provider.displayName,
      available: health.available,
      supportedTypes: [
        ...(provider.getCapabilities().textToVideo ? ['text_to_video'] : []),
        ...(provider.getCapabilities().imageToVideo ? ['image_to_video'] : []),
      ],
      documentedQuota: quota.documentedFreeQuota,
      remainingQuota: quota.remainingQuota,
      queueStatus: quota.queueStatus ?? health.status,
      lastCheckedAt: new Date(health.checkedAt),
      lastErrorAt: health.available ? existing?.lastErrorAt : new Date(),
      lastError: health.available ? null : (health.error || health.message || 'Unavailable'),
      consecutiveFailures: health.available ? 0 : failures,
      metadata: { quotaNotes, homepage: provider.homepage },
    },
  });
  return { ...health, providerKey: provider.key };
}

export async function recordProviderFailure(providerKey: string, message: string) {
  const existing = await prisma.providerHealth.findUnique({ where: { providerKey } });
  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  await prisma.providerHealth.upsert({
    where: { providerKey },
    create: {
      providerKey,
      modelKey: providerKey,
      displayName: providerKey,
      available: false,
      supportedTypes: [],
      lastErrorAt: new Date(),
      lastError: message,
      consecutiveFailures: failures,
      cooldownUntil: cooldownUntil(failures),
    },
    update: {
      available: false,
      lastErrorAt: new Date(),
      lastError: message,
      consecutiveFailures: failures,
      cooldownUntil: cooldownUntil(failures),
    },
  });
}

export async function recordProviderSuccess(providerKey: string) {
  await prisma.providerHealth.updateMany({
    where: { providerKey },
    data: {
      available: true,
      lastSuccessAt: new Date(),
      lastError: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
    },
  });
}

export type RouteCandidate = {
  adapter: ProviderAdapter;
  reason: string;
};

export async function selectProviders(opts: {
  type: GenerationType;
  requestedProviderKey?: string | null;
  requestedModelKey?: string | null;
  excludeProviderKeys?: string[];
}): Promise<RouteCandidate[]> {
  const adapters = getProviderAdapters();
  const exclude = new Set(opts.excludeProviderKeys || []);
  let candidates = adapters.filter((a) => {
    if (exclude.has(a.key)) return false;
    const caps = a.getCapabilities();
    if (opts.type === 'text_to_video' && !caps.textToVideo) return false;
    if (opts.type === 'image_to_video' && !caps.imageToVideo) return false;
    if (opts.requestedProviderKey && a.key !== opts.requestedProviderKey) return false;
    if (opts.requestedModelKey && a.modelKey !== opts.requestedModelKey && a.key !== opts.requestedModelKey) return false;
    return true;
  });

  // load health rows
  const keys = candidates.map((c) => c.key);
  const healthRows = await prisma.providerHealth.findMany({ where: { providerKey: { in: keys } } });
  const healthMap = new Map(healthRows.map((h) => [h.providerKey, h]));
  const now = Date.now();

  const scored = candidates.map((adapter) => {
    const h = healthMap.get(adapter.key);
    let score = 100 - adapter.priority; // base from configured priority
    let reason = 'configured';
    if (h) {
      if (h.cooldownUntil && h.cooldownUntil.getTime() > now) { score -= 1000; reason = 'cooldown'; }
      else if (h.available === false) { score -= 50; reason = 'recently unavailable'; }
      else if (h.available === true) { score += 20; reason = 'healthy'; }
      if (h.lastSuccessAt) score += 10;
      score -= (h.consecutiveFailures || 0) * 5;
    } else {
      reason = 'unknown health';
    }
    return { adapter, score, reason };
  });

  scored.sort((a, b) => b.score - a.score || a.adapter.priority - b.adapter.priority);
  return scored.map((s) => ({ adapter: s.adapter, reason: s.reason }));
}

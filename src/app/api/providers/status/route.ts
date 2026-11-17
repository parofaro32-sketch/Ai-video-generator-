import { NextResponse } from 'next/server';
import { prisma, isDatabaseConfigurationError, databaseConfigErrorResponse } from '@/lib/db';
import { getProviderAdapters } from '@/lib/providers/registry';
import { refreshProviderHealth } from '@/lib/providers/router';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const refresh = url.searchParams.get('refresh') === '1';
    const adapters = getProviderAdapters();
    if (refresh) {
      // best-effort refresh a few providers (avoid long waits)
      await Promise.all(adapters.map((a) => refreshProviderHealth(a).catch(() => null)));
    }
    let rows: any[] = [];
    let dbWarning: string | null = null;
    try {
      rows = await prisma.providerHealth.findMany({ orderBy: { updatedAt: 'desc' } });
    } catch (e) {
      if (isDatabaseConfigurationError(e)) dbWarning = 'Database not configured; showing configured providers without persisted health history.';
      else throw e;
    }
    // include configured adapters not yet in DB
    const known = new Set(rows.map(r => r.providerKey));
    const configured = adapters.map(a => {
      const row = rows.find(r => r.providerKey === a.key);
      const caps = a.getCapabilities();
      return {
        providerKey: a.key,
        modelKey: a.modelKey,
        displayName: a.displayName,
        modelDisplayName: a.modelDisplayName,
        configured: true,
        available: row?.available ?? null,
        supportedTypes: row?.supportedTypes ?? [ ...(caps.textToVideo?['text_to_video']:[]), ...(caps.imageToVideo?['image_to_video']:[]) ],
        documentedQuota: row?.documentedQuota ?? 'Community free tier (provider-managed, dynamic)',
        remainingQuota: row?.remainingQuota ?? null,
        queueStatus: row?.queueStatus ?? null,
        lastCheckedAt: row?.lastCheckedAt ?? null,
        lastSuccessAt: row?.lastSuccessAt ?? null,
        lastErrorAt: row?.lastErrorAt ?? null,
        lastError: row?.lastError ?? null,
        cooldownUntil: row?.cooldownUntil ?? null,
        capabilities: caps,
        spaceUrl: a.spaceUrl,
      };
    });
    const dbOnly = rows.filter(r => !adapters.some(a => a.key === r.providerKey));
    return NextResponse.json({ providers: [...configured, ...dbOnly], refreshed: refresh, at: new Date().toISOString(), ...(dbWarning ? { warning: dbWarning } : {}) });
  } catch (e: any) {
    if (isDatabaseConfigurationError(e)) {
      return NextResponse.json({ ...databaseConfigErrorResponse(), providers: [] }, { status: 503 });
    }
    return NextResponse.json({ error: e?.message || 'Failed to load provider status' }, { status: 500 });
  }
}

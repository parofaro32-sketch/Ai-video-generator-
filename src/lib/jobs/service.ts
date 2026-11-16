import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { getStorage, downloadToBuffer, makeStorageKey, isLocalStorage } from '@/lib/storage';
import { getProviderByKey } from '@/lib/providers/registry';
import { selectProviders, recordProviderFailure, recordProviderSuccess, refreshProviderHealth } from '@/lib/providers/router';
import type { AspectRatio, GenerationType } from '@/types/generation';

function aspectToEnum(a: AspectRatio) {
  if (a === '16:9') return 'ratio_16_9';
  if (a === '9:16') return 'ratio_9_16';
  return 'ratio_1_1';
}
function enumToAspect(e: string): AspectRatio {
  if (e === 'ratio_9_16') return '9:16';
  if (e === 'ratio_1_1') return '1:1';
  return '16:9';
}

export type CreateJobInput = {
  userId: string;
  type: GenerationType;
  prompt: string;
  negativePrompt?: string;
  imageInputUrl?: string;
  imageInputData?: { buffer: Buffer; mimeType: string; filename: string };
  aspectRatio: AspectRatio;
  durationSec?: number;
  resolution?: string;
  seed?: number;
  enhancePrompt?: boolean;
  requestedModelKey?: string;
  autoSelect?: boolean;
  projectId?: string;
  sceneIndex?: number;
};

function duplicateHash(input: CreateJobInput) {
  const key = JSON.stringify({
    userId: input.userId,
    type: input.type,
    prompt: input.prompt.trim(),
    negativePrompt: input.negativePrompt || '',
    image: input.imageInputUrl || (input.imageInputData ? 'inline' : ''),
    aspectRatio: input.aspectRatio,
    durationSec: input.durationSec || null,
    resolution: input.resolution || null,
    seed: input.seed ?? null,
    model: input.requestedModelKey || 'auto',
  });
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function createGenerationJob(input: CreateJobInput) {
  if (!input.prompt || !input.prompt.trim()) throw new Error('Prompt is required');
  if (input.type === 'image_to_video' && !input.imageInputUrl && !input.imageInputData) {
    throw new Error('Image input is required for image-to-video');
  }

  // duplicate-job prevention: active job with same payload in last 5 minutes
  const hash = duplicateHash(input);
  const recent = await prisma.generationJob.findFirst({
    where: {
      userId: input.userId,
      status: { in: ['queued', 'submitting', 'running'] },
      createdAt: { gt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  // lightweight: if exact same recent active job settings hash stored in providerMeta/ settings, block
  if (recent && (recent.settings as any)?.dedupeHash === hash) {
    return { job: recent, duplicate: true };
  }

  let storedImageUrl: string | undefined = input.imageInputUrl;
  if (input.imageInputData) {
    const storage = getStorage();
    const ext = (input.imageInputData.mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
    const key = makeStorageKey(`inputs/${input.userId}`, ext);
    const stored = await storage.put(key, input.imageInputData.buffer, input.imageInputData.mimeType);
    storedImageUrl = stored.url;
  }

  const job = await prisma.generationJob.create({
    data: {
      userId: input.userId,
      type: input.type,
      status: 'queued',
      prompt: input.prompt.trim(),
      negativePrompt: input.negativePrompt?.trim() || null,
      imageInputUrl: storedImageUrl || null,
      aspectRatio: aspectToEnum(input.aspectRatio) as any,
      durationSeconds: input.durationSec ?? null,
      resolution: input.resolution ?? null,
      seed: input.seed ?? null,
      requestedModelKey: input.requestedModelKey ?? null,
      projectId: input.projectId ?? null,
      sceneIndex: input.sceneIndex ?? null,
      settings: {
        dedupeHash: hash,
        enhancePrompt: !!input.enhancePrompt,
        autoSelect: input.autoSelect !== false,
      } as any,
      events: { create: { level: 'info', message: 'Job queued' } },
    },
  });
  return { job, duplicate: false };
}

export async function getJobForUser(jobId: string, userId: string) {
  return prisma.generationJob.findFirst({ where: { id: jobId, userId }, include: { outputVideo: true, events: { orderBy: { createdAt: 'desc' }, take: 20 } } });
}

async function logEvent(jobId: string, level: string, message: string, data?: any) {
  await prisma.jobEvent.create({ data: { jobId, level, message, data: data ?? undefined } }).catch(() => {});
}

async function trySubmit(job: any): Promise<boolean> {
  const tried = new Set<string>(Array.isArray((job.providerMeta as any)?.triedProviders) ? (job.providerMeta as any).triedProviders : []);
  if (job.providerKey) tried.add(job.providerKey);
  const candidates = await selectProviders({
    type: job.type as GenerationType,
    requestedModelKey: job.requestedModelKey,
    requestedProviderKey: (job.settings as any)?.requestedProviderKey || null,
    excludeProviderKeys: Array.from(tried),
  });

  if (candidates.length === 0) {
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        lastError: 'No compatible free provider is currently available. Please try again later.',
        completedAt: new Date(),
      },
    });
    await logEvent(job.id, 'error', 'No compatible free provider available');
    return false;
  }

  for (const cand of candidates) {
    const provider = cand.adapter;
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: 'submitting', providerKey: provider.key, modelKey: provider.modelKey, attemptCount: { increment: 1 } },
    });
    await logEvent(job.id, 'info', `Submitting to ${provider.displayName} (${cand.reason})`);
    try {
      // quick health refresh (best effort)
      await refreshProviderHealth(provider).catch(() => {});
      const submission = await provider.submitGeneration({
        type: job.type as GenerationType,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt || undefined,
        imageInput: job.imageInputUrl ? { url: job.imageInputUrl } : undefined,
        aspectRatio: enumToAspect(job.aspectRatio),
        durationSec: job.durationSeconds ?? undefined,
        resolution: job.resolution ?? undefined,
        seed: job.seed ?? undefined,
        enhancePrompt: !!(job.settings as any)?.enhancePrompt,
      });
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: submission.status === 'running' ? 'running' : 'queued',
          providerJobId: submission.providerJobId,
          queuePosition: submission.queuePosition ?? null,
          estimatedWaitSec: submission.estimatedWaitSec ?? null,
          startedAt: new Date(),
          providerMeta: { ...(job.providerMeta as any || {}), submission: submission.raw, triedProviders: Array.from(new Set([...Array.from(tried), provider.key])) },
        },
      });
      await logEvent(job.id, 'info', `Submitted to ${provider.displayName}`, { providerJobId: submission.providerJobId });
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      await logEvent(job.id, 'warn', `Provider ${provider.displayName} submit failed: ${msg}`);
      await recordProviderFailure(provider.key, msg).catch(() => {});
      await prisma.providerMetric.create({ data: { providerKey: provider.key, success: false, errorMessage: msg.slice(0, 500), jobId: job.id } }).catch(() => {});
      // try next candidate
      tried.add(provider.key);
      await prisma.generationJob.update({ where: { id: job.id }, data: { providerMeta: { ...(job.providerMeta as any || {}), triedProviders: Array.from(tried) } } });
    }
  }

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { status: 'failed', lastError: 'All compatible providers failed to accept the job. Please try again later.', completedAt: new Date() },
  });
  await logEvent(job.id, 'error', 'All compatible providers failed during submission');
  return false;
}

async function completeWithResult(job: any): Promise<void> {
  if (!job.providerKey || !job.providerJobId) throw new Error('Missing provider job info');
  const provider = getProviderByKey(job.providerKey);
  if (!provider) throw new Error('Provider adapter not found');
  const result = await provider.getResult(job.providerJobId, job.providerMeta as any);
  if (!result.videoUrl) throw new Error('Provider returned no video URL');
  const { buffer, contentType } = await downloadToBuffer(result.videoUrl);
  const storage = getStorage();
  const ext = contentType.includes('webm') ? 'webm' : contentType.includes('gif') ? 'gif' : 'mp4';
  const key = makeStorageKey(`videos/${job.userId}`, ext);
  const stored = await storage.put(key, buffer, contentType.includes('video') || contentType.includes('gif') ? contentType : 'video/mp4');

  const video = await prisma.video.create({
    data: {
      userId: job.userId,
      storageKey: stored.key,
      storageUrl: stored.url,
      mimeType: stored.contentType || contentType || 'video/mp4',
      sizeBytes: stored.sizeBytes ?? buffer.length,
      prompt: job.prompt,
      negativePrompt: job.negativePrompt,
      modelKey: job.modelKey || provider.modelKey,
      providerKey: job.providerKey,
      type: job.type,
      aspectRatio: job.aspectRatio,
      seed: result.seed ?? job.seed ?? null,
      durationSec: result.durationSec ?? job.durationSeconds ?? null,
      width: result.width ?? null,
      height: result.height ?? null,
      settings: job.settings as any,
      sourceJobId: job.id,
      projectId: job.projectId,
      sceneIndex: job.sceneIndex,
    },
  });
  await prisma.generationJob.update({
    where: { id: job.id },
    data: { status: 'succeeded', completedAt: new Date(), outputVideoId: video.id, progress: 1, progressMessage: 'Completed', lastError: null },
  });
  await logEvent(job.id, 'info', 'Generation completed and video stored', { videoId: video.id });
  await recordProviderSuccess(job.providerKey).catch(() => {});
  await prisma.providerMetric.create({ data: { providerKey: job.providerKey, success: true, jobId: job.id } }).catch(() => {});
}

export async function processJobTick(jobId: string, userId?: string) {
  const where: any = { id: jobId };
  if (userId) where.userId = userId;
  const job = await prisma.generationJob.findFirst({ where });
  if (!job) throw new Error('Job not found');
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') return job;

  try {
    const hasActiveProviderJob = !!(job.providerJobId && job.providerKey);

    if (!hasActiveProviderJob && (job.status === 'queued' || job.status === 'submitting')) {
      await trySubmit(job);
      return prisma.generationJob.findUnique({ where: { id: job.id }, include: { outputVideo: true } });
    }

    if (hasActiveProviderJob && (job.status === 'queued' || job.status === 'running' || job.status === 'submitting')) {
      const provider = getProviderByKey(job.providerKey!);
      if (!provider) throw new Error('Provider adapter not found for running job');
      const status = await provider.getJobStatus(job.providerJobId!, job.providerMeta as any);
      if (status.status === 'succeeded') {
        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: 'running',
            progress: status.progress ?? 0.95,
            progressMessage: status.progressMessage ?? 'Finalizing result',
            queuePosition: status.queuePosition ?? null,
            estimatedWaitSec: status.estimatedWaitSec ?? null,
            providerMeta: { ...(job.providerMeta as any || {}), ...(status.raw as any || {}) },
          },
        });
        const fresh = await prisma.generationJob.findUnique({ where: { id: job.id } });
        await completeWithResult(fresh);
      } else if (status.status === 'failed') {
        const msg = status.error || 'Provider reported generation failure';
        await logEvent(job.id, 'warn', `Provider failure: ${msg}`);
        await recordProviderFailure(job.providerKey!, msg).catch(() => {});
        await prisma.providerMetric.create({ data: { providerKey: job.providerKey!, success: false, errorMessage: msg.slice(0, 500), jobId: job.id } }).catch(() => {});
        // automatic fallback: try other providers
        const updated = await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: 'queued',
            providerJobId: null,
            providerKey: null,
            lastError: msg,
            progressMessage: 'Retrying with another provider',
            providerMeta: { ...(job.providerMeta as any || {}), lastProviderError: msg },
          },
        });
        await trySubmit(updated);
      } else {
        await prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: status.status === 'queued' ? 'queued' : 'running',
            progress: status.progress ?? job.progress ?? null,
            progressMessage: status.progressMessage ?? job.progressMessage ?? null,
            queuePosition: status.queuePosition ?? job.queuePosition ?? null,
            estimatedWaitSec: status.estimatedWaitSec ?? job.estimatedWaitSec ?? null,
          },
        });
      }
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    await logEvent(job.id, 'error', `Processing error: ${msg}`);
    // if we have a provider, mark failure and attempt fallback/retry logic
    if (job.attemptCount < 3) {
      if (job.providerKey) await recordProviderFailure(job.providerKey, msg).catch(() => {});
      const tried = new Set<string>(Array.isArray((job.providerMeta as any)?.triedProviders) ? (job.providerMeta as any).triedProviders : []);
      if (job.providerKey) tried.add(job.providerKey);
      const updated = await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'queued',
          providerJobId: null,
          providerKey: null,
          lastError: msg,
          progressMessage: 'Recovering and retrying',
          providerMeta: { ...(job.providerMeta as any || {}), triedProviders: Array.from(tried), lastProviderError: msg },
        },
      });
      await trySubmit(updated);
    } else {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: 'failed', lastError: msg, completedAt: new Date() },
      });
    }
  }

  return prisma.generationJob.findUnique({ where: { id: job.id }, include: { outputVideo: true } });
}

export async function processJobUntilSettledOrTimeout(jobId: string, userId: string, budgetMs = 20000) {
  const start = Date.now();
  let job = await getJobForUser(jobId, userId);
  if (!job) throw new Error('Job not found');
  while (Date.now() - start < budgetMs) {
    job = await processJobTick(jobId, userId) as any;
    if (!job) break;
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) break;
    // if running on remote queue, don't spin tightly inside one request
    if (job.status === 'running' || job.status === 'queued') {
      // do at most 2 ticks per request to avoid long serverless execution
      if (Date.now() - start > 5000) break;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return getJobForUser(jobId, userId);
}

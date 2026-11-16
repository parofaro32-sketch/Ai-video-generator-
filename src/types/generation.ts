export type GenerationType = 'text_to_video' | 'image_to_video';
export type AspectRatio = '16:9' | '9:16' | '1:1';
export type JobStatus = 'queued' | 'submitting' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface GenerationCapabilities {
  textToVideo: boolean;
  imageToVideo: boolean;
  videoToVideo?: boolean;
  negativePrompt?: boolean;
  seed?: boolean;
  promptEnhancement?: boolean;
  aspectRatios: AspectRatio[];
  durationsSec?: number[];
  minDurationSec?: number;
  maxDurationSec?: number;
  resolutions?: string[];
  maxFrames?: number;
  notes?: string[];
}

export interface ProviderQuotaInfo {
  documentedFreeQuota?: string;
  remainingQuota?: string;
  queueStatus?: string;
  notes?: string[];
}

export interface ProviderHealthInfo {
  available: boolean;
  checkedAt: string;
  latencyMs?: number;
  status?: string;
  message?: string;
  error?: string;
}

export interface SubmitGenerationInput {
  type: GenerationType;
  prompt: string;
  negativePrompt?: string;
  imageInput?: { url?: string; data?: Buffer | Uint8Array; mimeType?: string; filename?: string };
  aspectRatio: AspectRatio;
  durationSec?: number;
  resolution?: string;
  seed?: number;
  enhancePrompt?: boolean;
  extra?: Record<string, unknown>;
}

export interface SubmitGenerationResult {
  providerJobId: string;
  status: 'queued' | 'running';
  queuePosition?: number;
  estimatedWaitSec?: number;
  raw?: unknown;
}

export interface ProviderJobStatus {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress?: number;
  progressMessage?: string;
  queuePosition?: number;
  estimatedWaitSec?: number;
  error?: string;
  raw?: unknown;
}

export interface ProviderResult {
  videoUrl?: string;
  videoBuffer?: Buffer;
  mimeType?: string;
  thumbnailUrl?: string;
  seed?: number;
  durationSec?: number;
  width?: number;
  height?: number;
  raw?: unknown;
}

export interface ProviderAdapter {
  key: string;
  displayName: string;
  modelKey: string;
  modelDisplayName: string;
  homepage?: string;
  spaceUrl?: string;
  priority: number; // lower = higher priority
  getCapabilities(): GenerationCapabilities;
  checkAvailability(): Promise<ProviderHealthInfo>;
  getQuota(): Promise<ProviderQuotaInfo>;
  submitGeneration(input: SubmitGenerationInput): Promise<SubmitGenerationResult>;
  getJobStatus(providerJobId: string, meta?: Record<string, unknown>): Promise<ProviderJobStatus>;
  getResult(providerJobId: string, meta?: Record<string, unknown>): Promise<ProviderResult>;
  cancelJob?(providerJobId: string, meta?: Record<string, unknown>): Promise<void>;
}

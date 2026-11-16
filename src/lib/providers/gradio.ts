import type {
  GenerationCapabilities,
  GenerationType,
  ProviderAdapter,
  ProviderHealthInfo,
  ProviderJobStatus,
  ProviderQuotaInfo,
  ProviderResult,
  SubmitGenerationInput,
  SubmitGenerationResult,
} from '@/types/generation';

type GradioFileData = {
  path?: string;
  url?: string;
  orig_name?: string;
  mime_type?: string;
  size?: number | null;
  is_stream?: boolean;
  meta?: { _type: 'gradio.FileData' };
};

export type GradioEndpointConfig = {
  key: string;
  displayName: string;
  modelKey: string;
  modelDisplayName: string;
  spaceUrl: string; // e.g. https://lightricks-ltx-video-distilled.hf.space
  apiNameText?: string; // named endpoint like image_to_video
  apiNameImage?: string;
  priority: number;
  capabilities: GenerationCapabilities;
  documentedQuota?: string;
  notes?: string[];
  // Map our input to gradio parameter order/values for each endpoint
  buildTextArgs?: (input: SubmitGenerationInput) => unknown[];
  buildImageArgs?: (input: SubmitGenerationInput, uploadedImage: GradioFileData) => unknown[];
  extractVideo?: (data: unknown) => { file?: GradioFileData | string; seed?: number } | null;
};

function authHeaders(): Record<string, string> {
  const token = process.env.HF_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function gradioUploadFile(spaceUrl: string, file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append('files', file, filename);
  const res = await fetch(`${spaceUrl}/gradio_api/upload`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as string[] | { path?: string } | unknown;
  if (Array.isArray(json) && typeof json[0] === 'string') return json[0];
  if (json && typeof json === 'object' && 'path' in json && typeof (json as any).path === 'string') return (json as any).path;
  throw new Error(`Unexpected upload response: ${JSON.stringify(json).slice(0, 200)}`);
}

export async function gradioCall(spaceUrl: string, apiName: string, data: unknown[]): Promise<string> {
  const json = await fetchJson<{ event_id?: string }>(`${spaceUrl}/gradio_api/call/${apiName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data }),
  });
  if (!json.event_id) throw new Error(`No event_id in response: ${JSON.stringify(json)}`);
  return json.event_id;
}

export type GradioEvent =
  | { event: 'generating' | 'progress' | 'pending' | 'heartbeat'; data?: unknown }
  | { event: 'complete'; data?: unknown }
  | { event: 'error'; data?: unknown; message?: string };

function parseSseBlock(block: string): GradioEvent | null {
  const lines = block.split('\n');
  let event = '';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!event) return null;
  const dataStr = dataLines.join('\n');
  let data: unknown = dataStr;
  if (dataStr) {
    try { data = JSON.parse(dataStr); } catch { /* keep string */ }
  }
  return { event, data } as GradioEvent;
}

export async function gradioPollEvent(
  spaceUrl: string,
  apiName: string,
  eventId: string,
  opts?: { timeoutMs?: number }
): Promise<GradioEvent[]> {
  const timeoutMs = opts?.timeoutMs ?? 25000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${spaceUrl}/gradio_api/call/${apiName}/${eventId}`, {
      headers: { Accept: 'text/event-stream', ...authHeaders() },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status fetch failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    const text = await res.text();
    const blocks = text.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
    const events: GradioEvent[] = [];
    for (const b of blocks) {
      const ev = parseSseBlock(b);
      if (ev) events.push(ev);
    }
    return events;
  } catch (e: any) {
    if (e?.name === 'AbortError') return []; // no new events yet within window
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function pickFinalFromEvents(events: GradioEvent[]): GradioEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === 'complete' || events[i].event === 'error') return events[i];
  }
  return null;
}

export function fileDataToUrl(spaceUrl: string, file: GradioFileData | string | null | undefined): string | undefined {
  if (!file) return undefined;
  if (typeof file === 'string') {
    if (file.startsWith('http://') || file.startsWith('https://')) return file;
    return `${spaceUrl}/gradio_api/file=${file}`;
  }
  if (file.url) return file.url;
  if (file.path) {
    if (file.path.startsWith('http')) return file.path;
    return `${spaceUrl}/gradio_api/file=${file.path}`;
  }
  return undefined;
}

export class GradioProviderAdapter implements ProviderAdapter {
  key: string;
  displayName: string;
  modelKey: string;
  modelDisplayName: string;
  homepage?: string;
  spaceUrl: string;
  priority: number;
  private cfg: GradioEndpointConfig;

  constructor(cfg: GradioEndpointConfig) {
    this.cfg = cfg;
    this.key = cfg.key;
    this.displayName = cfg.displayName;
    this.modelKey = cfg.modelKey;
    this.modelDisplayName = cfg.modelDisplayName;
    this.homepage = cfg.spaceUrl;
    this.spaceUrl = cfg.spaceUrl;
    this.priority = cfg.priority;
  }

  getCapabilities(): GenerationCapabilities {
    return this.cfg.capabilities;
  }

  async checkAvailability(): Promise<ProviderHealthInfo> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.cfg.spaceUrl}/config`, {
        headers: { ...authHeaders() },
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { available: false, checkedAt: new Date().toISOString(), latencyMs, status: `HTTP ${res.status}`, error: `HTTP ${res.status}` };
      }
      const json = await res.json().catch(() => null);
      const ok = !!json && typeof json === 'object';
      return { available: ok, checkedAt: new Date().toISOString(), latencyMs, status: ok ? 'reachable' : 'invalid-config' };
    } catch (e: any) {
      return { available: false, checkedAt: new Date().toISOString(), error: e?.message || String(e) };
    }
  }

  async getQuota(): Promise<ProviderQuotaInfo> {
    return {
      documentedFreeQuota: this.cfg.documentedQuota || 'Community free tier (ZeroGPU/public Space). Quotas are provider-managed and may be shared or limited; not independently verifiable via API.',
      queueStatus: 'Unknown (check at generation time)',
      notes: this.cfg.notes || [],
    };
  }

  private apiNameFor(type: GenerationType): string {
    if (type === 'text_to_video') {
      if (!this.cfg.apiNameText) throw new Error('Text-to-video not supported by this provider');
      return this.cfg.apiNameText;
    }
    if (!this.cfg.apiNameImage) throw new Error('Image-to-video not supported by this provider');
    return this.cfg.apiNameImage;
  }

  async submitGeneration(input: SubmitGenerationInput): Promise<SubmitGenerationResult> {
    const apiName = this.apiNameFor(input.type);
    let data: unknown[];
    if (input.type === 'image_to_video') {
      if (!input.imageInput) throw new Error('Image input required');
      let uploadedPath: string | undefined;
      if (input.imageInput.data) {
        const blob = new Blob([input.imageInput.data as any], { type: input.imageInput.mimeType || 'image/png' });
        uploadedPath = await gradioUploadFile(this.cfg.spaceUrl, blob, input.imageInput.filename || 'input.png');
      } else if (input.imageInput.url) {
        // Fetch and upload. Supports absolute URLs and local storage paths (/api/storage/...).
        let buf: Buffer;
        let mime = input.imageInput.mimeType || 'image/png';
        const url = input.imageInput.url;
        if (url.startsWith('/api/storage/')) {
          const key = url.replace(/^\/api\/storage\//, '');
          const { readLocalStorage } = await import('@/lib/storage');
          const local = await readLocalStorage(key);
          if (!local) throw new Error(`Local input image not found: ${key}`);
          buf = local;
          const lower = key.toLowerCase();
          mime = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : lower.endsWith('.webp') ? 'image/webp' : lower.endsWith('.gif') ? 'image/gif' : 'image/png';
        } else {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Failed to fetch input image: HTTP ${r.status}`);
          buf = Buffer.from(await r.arrayBuffer());
          mime = r.headers.get('content-type') || mime;
        }
        uploadedPath = await gradioUploadFile(this.cfg.spaceUrl, new Blob([new Uint8Array(buf)], { type: mime }), input.imageInput.filename || 'input.png');
      }
      if (!uploadedPath) throw new Error('Could not prepare image upload');
      const fileData: GradioFileData = { path: uploadedPath, url: null as any, orig_name: input.imageInput.filename || 'input.png', mime_type: input.imageInput.mimeType || 'image/png', size: null, is_stream: false, meta: { _type: 'gradio.FileData' } };
      if (this.cfg.buildImageArgs) data = this.cfg.buildImageArgs(input, fileData);
      else throw new Error('No image argument builder configured');
    } else {
      if (this.cfg.buildTextArgs) data = this.cfg.buildTextArgs(input);
      else throw new Error('No text argument builder configured');
    }
    const eventId = await gradioCall(this.cfg.spaceUrl, apiName, data);
    return {
      providerJobId: `${apiName}:${eventId}`,
      status: 'queued',
      raw: { eventId, apiName },
    };
  }

  parseProviderJobId(providerJobId: string): { apiName: string; eventId: string } {
    const idx = providerJobId.indexOf(':');
    if (idx === -1) throw new Error('Invalid provider job id');
    return { apiName: providerJobId.slice(0, idx), eventId: providerJobId.slice(idx + 1) };
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatus> {
    const { apiName, eventId } = this.parseProviderJobId(providerJobId);
    const events = await gradioPollEvent(this.cfg.spaceUrl, apiName, eventId, { timeoutMs: 20000 });
    const final = pickFinalFromEvents(events);
    if (!final) {
      // look for progress in latest generating event
      const last = [...events].reverse().find(e => e.event === 'generating' || e.event === 'progress' || e.event === 'pending');
      let msg: string | undefined;
      let progress: number | undefined;
      let queuePosition: number | undefined;
      let est: number | undefined;
      if (last && last.data && typeof last.data === 'object') {
        const d: any = last.data;
        if (d.progress_data) {
          const pd = Array.isArray(d.progress_data) ? d.progress_data[0] : d.progress_data;
          if (pd?.index != null && pd?.length) progress = pd.index / pd.length;
          if (pd?.desc) msg = pd.desc;
        }
        if (d.msg) msg = String(d.msg);
        if (d.rank != null) queuePosition = Number(d.rank);
        if (d.queue_size != null && queuePosition == null) queuePosition = Number(d.queue_size);
        if (d.rank_eta != null) est = Number(d.rank_eta);
      }
      return { status: last ? 'running' : 'queued', progress, progressMessage: msg, queuePosition, estimatedWaitSec: est, raw: { eventsCount: events.length } };
    }
    if (final.event === 'error') {
      const msg = typeof final.data === 'string' ? final.data : (Array.isArray(final.data) ? String(final.data[0]) : JSON.stringify(final.data || 'Generation error'));
      return { status: 'failed', error: msg, raw: final };
    }
    return { status: 'succeeded', raw: { completeData: final.data } };
  }

  async getResult(providerJobId: string, meta?: Record<string, unknown>): Promise<ProviderResult> {
    // If a completed event was already captured during status polling, reuse it to avoid
    // re-consuming the Gradio SSE stream.
    let data: unknown = (meta as any)?.completeData;
    if (data === undefined) {
      const { apiName, eventId } = this.parseProviderJobId(providerJobId);
      const events = await gradioPollEvent(this.cfg.spaceUrl, apiName, eventId, { timeoutMs: 20000 });
      const final = pickFinalFromEvents(events);
      if (!final || final.event !== 'complete') throw new Error('Result not ready');
      data = final.data;
    }
    const extracted = this.cfg.extractVideo ? this.cfg.extractVideo(data) : this.defaultExtract(data);
    if (!extracted?.file) throw new Error(`Could not extract video from result: ${JSON.stringify(data).slice(0, 400)}`);
    const videoUrl = fileDataToUrl(this.cfg.spaceUrl, extracted.file);
    if (!videoUrl) throw new Error('Could not resolve video URL');
    return { videoUrl, seed: extracted.seed, raw: data };
  }

  private defaultExtract(data: unknown): { file?: GradioFileData | string; seed?: number } | null {
    // common: [ { video: {path/url,...}, subtitles:null }, seed ]
    if (Array.isArray(data)) {
      const first = data[0];
      if (first && typeof first === 'object') {
        if ('video' in (first as any)) return { file: (first as any).video, seed: typeof data[1] === 'number' ? data[1] : undefined };
        if ('path' in (first as any) || 'url' in (first as any)) return { file: first as any, seed: typeof data[1] === 'number' ? data[1] : undefined };
      }
      if (typeof first === 'string') return { file: first };
    }
    if (data && typeof data === 'object' && 'video' in (data as any)) return { file: (data as any).video };
    return null;
  }
}

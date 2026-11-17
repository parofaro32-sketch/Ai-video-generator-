import type { AspectRatio, ProviderAdapter } from '@/types/generation';
import { GradioProviderAdapter, type GradioEndpointConfig } from './gradio';

function dimsForAspect(aspect: AspectRatio): { width: number; height: number } {
  switch (aspect) {
    case '16:9': return { width: 704, height: 384 };
    case '9:16': return { width: 384, height: 704 };
    case '1:1': return { width: 512, height: 512 };
    default: return { width: 704, height: 384 };
  }
}

function clamp32(v: number, min = 256, max = 1280) {
  const c = Math.max(min, Math.min(max, v));
  return Math.round(c / 32) * 32;
}

function pickSeed(seed?: number) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return { seed: Math.max(0, Math.floor(seed)), randomize: false };
  return { seed: Math.floor(Math.random() * 2_147_483_647), randomize: true };
}

const ltxDistilled: GradioEndpointConfig = {
  key: 'ltx-video-distilled',
  displayName: 'Lightricks LTX-Video 0.9.8 Distilled (Hugging Face Space)',
  modelKey: 'ltx-video-0.9.8-distilled',
  modelDisplayName: 'LTX-Video 0.9.8 13B Distilled',
  spaceUrl: 'https://lightricks-ltx-video-distilled.hf.space',
  apiNameText: 'text_to_video',
  apiNameImage: 'image_to_video',
  priority: 10,
  documentedQuota: 'Free public Hugging Face Space (shared). Availability and queue depend on provider load.',
  notes: [
    'Public Hugging Face Space (Gradio API). Supports text-to-video and image-to-video.',
    'Free usage is shared and queue-based; availability may vary.',
  ],
  capabilities: {
    textToVideo: true,
    imageToVideo: true,
    negativePrompt: true,
    seed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    minDurationSec: 0.3,
    maxDurationSec: 8.5,
    resolutions: ['384x704', '512x512', '704x384', 'custom within 256-1280 (multiples of 32)'],
    notes: ['Fast distilled model; short clips (sub-second to ~8.5s).'],
  },
  buildTextArgs: (input) => {
    const { width, height } = dimsForAspect(input.aspectRatio);
    const duration = Math.max(0.3, Math.min(8.5, input.durationSec ?? 2));
    const { seed, randomize } = pickSeed(input.seed);
    return [
      input.prompt,
      input.negativePrompt ?? 'worst quality, inconsistent motion, blurry, jittery, distorted',
      '',
      '',
      clamp32(height),
      clamp32(width),
      'text-to-video',
      duration,
      9,
      seed,
      randomize,
      1,
      true,
    ];
  },
  buildImageArgs: (input, uploadedImage) => {
    const { width, height } = dimsForAspect(input.aspectRatio);
    const duration = Math.max(0.3, Math.min(8.5, input.durationSec ?? 2));
    const { seed, randomize } = pickSeed(input.seed);
    return [
      input.prompt,
      input.negativePrompt ?? 'worst quality, inconsistent motion, blurry, jittery, distorted',
      uploadedImage,
      '',
      clamp32(height),
      clamp32(width),
      'image-to-video',
      duration,
      9,
      seed,
      randomize,
      1,
      true,
    ];
  },
  extractVideo: (data) => {
    if (Array.isArray(data)) {
      const first = data[0] as any;
      const seed = typeof data[1] === 'number' ? data[1] : undefined;
      if (first && typeof first === 'object') {
        if (first.video) return { file: first.video, seed };
        if (first.path || first.url) return { file: first, seed };
      }
      if (typeof first === 'string') return { file: first, seed };
    }
    return null;
  },
};

const cogVideoX2B: GradioEndpointConfig = {
  key: 'cogvideox-2b',
  displayName: 'ZhipuAI CogVideoX-2B (Hugging Face Space)',
  modelKey: 'cogvideox-2b',
  modelDisplayName: 'CogVideoX-2B',
  spaceUrl: 'https://zai-org-cogvideox-2b-space.hf.space',
  apiNameText: 'generate',
  priority: 20,
  documentedQuota: 'Free public Hugging Face Space (shared). Availability and queue depend on provider load.',
  notes: [
    'Public Hugging Face Space (Gradio API). Text-to-video only.',
    'Free usage is shared and queue-based; availability may vary.',
  ],
  capabilities: {
    textToVideo: true,
    imageToVideo: false,
    negativePrompt: false,
    seed: false,
    promptEnhancement: false,
    aspectRatios: ['16:9'],
    minDurationSec: undefined,
    maxDurationSec: undefined,
    notes: ['T2V only. Parameters: prompt, inference steps, guidance scale.'],
  },
  buildTextArgs: (input) => {
    return [
      input.prompt,
      50,
      6,
    ];
  },
  extractVideo: (data) => {
    const isVideoLike = (v: any) => {
      if (!v) return false;
      if (typeof v === 'string') return /\.(mp4|webm|mov|gif)(\?|$)/i.test(v) || v.includes('/gradio_api/file=') || v.startsWith('/tmp/');
      if (typeof v === 'object') {
        if (v.video) return true;
        const p = v.path || v.url || '';
        if (typeof p === 'string' && p) return /\.(mp4|webm|mov|gif)(\?|$)/i.test(p) || p.includes('/gradio_api/file=') || p.startsWith('/tmp/');
      }
      return false;
    };
    const toFile = (v: any) => {
      if (!v) return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'object') return v.video ? v.video : v;
      return undefined;
    };
    if (Array.isArray(data)) {
      // try first, then scan all outputs
      const candidates = [data[0], ...data.slice(1)];
      for (const item of candidates) {
        if (isVideoLike(item)) return { file: toFile(item) };
        if (item && typeof item === 'object' && item.value && isVideoLike(item.value)) return { file: toFile(item.value) };
      }
    }
    if (data && typeof data === 'object' && isVideoLike(data)) return { file: toFile(data) };
    return null;
  },
};

const zeroscopeV2: GradioEndpointConfig = {
  key: 'zeroscope-v2',
  displayName: 'Zeroscope v2 (Text-to-Video Space)',
  modelKey: 'zeroscope-v2',
  modelDisplayName: 'Zeroscope v2 (576w)',
  spaceUrl: 'https://hysts-zeroscope-v2.hf.space',
  apiNameText: 'run',
  priority: 25,
  documentedQuota: 'Free public Hugging Face Space quota (dynamic, shared).',
  notes: [
    'Public Hugging Face Space (Gradio API). Text-to-video.',
    'Output characteristics depend on the Space/model defaults; availability may vary.',
  ],
  capabilities: {
    textToVideo: true,
    imageToVideo: false,
    negativePrompt: false,
    seed: true,
    aspectRatios: ['16:9'],
    minDurationSec: 1,
    maxDurationSec: 4,
    notes: ['T2V only. Controls: frames (24-48), inference steps (10-50).'],
  },
  buildTextArgs: (input) => {
    const { seed } = pickSeed(input.seed);
    const steps = 25;
    // Approximate frames from requested duration (model/space dependent)
    const frames = Math.max(24, Math.min(48, Math.round((input.durationSec ?? 2) * 12)));
    return [input.prompt, seed, frames, steps];
  },
  extractVideo: (data) => {
    if (Array.isArray(data)) {
      const first = data[0] as any;
      if (first && typeof first === 'object') {
        if (first.video) return { file: first.video };
        if (first.path || first.url) return { file: first };
      }
      if (typeof first === 'string') return { file: first };
    }
    if (data && typeof data === 'object') {
      const d = data as any;
      if (d.video || d.path || d.url) return { file: d.video || d };
    }
    return null;
  },
};

const modelscopeT2V: GradioEndpointConfig = {
  key: 'modelscope-text-to-video',
  displayName: 'ModelScope Text-to-Video (1.7B Space)',
  modelKey: 'modelscope-t2v-1.7b',
  modelDisplayName: 'ModelScope Text-to-Video 1.7B',
  spaceUrl: 'https://mediasynthesismuseum-modelscope-text-to-video.hf.space',
  apiNameText: 'generate_1',
  priority: 30,
  documentedQuota: 'Free public Hugging Face Space quota (dynamic, shared).',
  notes: [
    'Public Hugging Face Space (Gradio API). Text-to-video (ModelScope 1.7B).',
    'Non-commercial/model-license terms may apply; availability may vary.',
  ],
  capabilities: {
    textToVideo: true,
    imageToVideo: false,
    negativePrompt: false,
    seed: true,
    aspectRatios: ['16:9'],
    minDurationSec: 1,
    maxDurationSec: 4,
    notes: ['T2V only. Controls: frames (16-100), inference steps (10-50).'],
  },
  buildTextArgs: (input) => {
    const seed = (typeof input.seed === 'number' && Number.isFinite(input.seed)) ? Math.max(-1, Math.floor(input.seed)) : -1;
    const numFrames = Math.max(16, Math.min(48, Math.round((input.durationSec ?? 2) * 12) || 24));
    const steps = 25;
    return [input.prompt, seed, numFrames, steps];
  },
  extractVideo: (data) => {
    if (Array.isArray(data)) {
      const first = data[0] as any;
      if (first && typeof first === 'object') {
        if (first.video) return { file: first.video };
        if (first.path || first.url) return { file: first };
      }
      if (typeof first === 'string') return { file: first };
    }
    if (data && typeof data === 'object') {
      const d = data as any;
      if (d.video || d.path || d.url) return { file: d.video || d };
    }
    return null;
  },
};

const wan21FastI2V: GradioEndpointConfig = {
  key: 'wan2-1-fast-i2v',
  displayName: 'Wan 2.1 Fast Image-to-Video (14B CausVid LoRA Space)',
  modelKey: 'wan2.1-i2v-14b-fast',
  modelDisplayName: 'Wan 2.1 I2V 14B (Fast/CausVid)',
  spaceUrl: 'https://multimodalart-wan2-1-fast.hf.space',
  apiNameImage: 'generate_video',
  priority: 22,
  documentedQuota: 'Free public Hugging Face Space quota (dynamic, shared).',
  notes: [
    'Public Hugging Face Space (Gradio API). Image-to-video (Wan 2.1 14B fast).',
    'Requires an input image; availability/quota depend on the Space.',
  ],
  capabilities: {
    textToVideo: false,
    imageToVideo: true,
    negativePrompt: true,
    seed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    minDurationSec: 0.3,
    maxDurationSec: 3.4,
    resolutions: ['128-896 (multiples of 32)'],
    notes: ['I2V only. Fast distilled Wan 2.1 variant; short clips.'],
  },
  buildImageArgs: (input, uploadedImage) => {
    const { width, height } = dimsForAspect(input.aspectRatio);
    const { seed, randomize } = pickSeed(input.seed);
    const duration = Math.max(0.3, Math.min(3.4, input.durationSec ?? 2));
    const negative = input.negativePrompt ?? 'Bright tones, overexposed, static, blurred details, subtitles, worst quality, low quality, deformed, watermark, text';
    // inputs: [image, prompt, height, width, negative_prompt, duration, guidance_scale, inference_steps, seed, randomize_seed]
    return [
      uploadedImage,
      input.prompt,
      clamp32(height, 128, 896),
      clamp32(width, 128, 896),
      negative,
      duration,
      1,
      4,
      seed,
      randomize,
    ];
  },
  extractVideo: (data) => {
    if (Array.isArray(data)) {
      const first = data[0] as any;
      const seed = typeof data[1] === 'number' ? data[1] : undefined;
      if (first && typeof first === 'object') {
        if (first.video) return { file: first.video, seed };
        if (first.path || first.url) return { file: first, seed };
      }
      if (typeof first === 'string') return { file: first, seed };
    }
    return null;
  },
};

const wan22I2V: GradioEndpointConfig = {
  key: 'wan2-2-i2v-14b',
  displayName: 'Wan 2.2 Image-to-Video (14B Space)',
  modelKey: 'wan2.2-i2v-14b',
  modelDisplayName: 'Wan 2.2 I2V 14B',
  spaceUrl: 'https://upsampler-wan-2-2-14b-image-to-video.hf.space',
  apiNameImage: 'generate_video',
  priority: 24,
  documentedQuota: 'Free public Hugging Face Space quota (dynamic, shared).',
  notes: [
    'Public Hugging Face Space (Gradio API). Image-to-video (Wan 2.2 14B).',
    'Requires an input image; availability/quota depend on the Space.',
  ],
  capabilities: {
    textToVideo: false,
    imageToVideo: true,
    negativePrompt: true,
    seed: true,
    aspectRatios: ['16:9', '9:16', '1:1'],
    minDurationSec: 0.5,
    maxDurationSec: 5,
    notes: ['I2V only. Animates a source image; output size/behavior depend on the Space.'],
  },
  buildImageArgs: (input, uploadedImage) => {
    const { seed, randomize } = pickSeed(input.seed);
    const duration = Math.max(0.5, Math.min(5, input.durationSec ?? 3.5));
    const negative = input.negativePrompt ?? '色调艳丽, 过曝, 静态, 细节模糊不清, 字幕, 最差质量, 低质量, 丑陋的, 畸形的, 静止不动的画面, 杂乱的背景, 水印, 文字';
    // inputs: [image, prompt, inference_steps, negative_prompt, duration, guidance_scale_high, guidance_scale_low, seed, randomize_seed, end_image(optional)]
    return [
      uploadedImage,
      input.prompt,
      6,
      negative,
      duration,
      1,
      1,
      seed,
      randomize,
      null,
    ];
  },
  extractVideo: (data) => {
    if (Array.isArray(data)) {
      const first = data[0] as any;
      const seed = typeof data[1] === 'number' ? data[1] : undefined;
      if (first && typeof first === 'object') {
        if (first.video) return { file: first.video, seed };
        if (first.path || first.url) return { file: first, seed };
      }
      if (typeof first === 'string') return { file: first, seed };
    }
    return null;
  },
};

export const providerConfigs: GradioEndpointConfig[] = [
  ltxDistilled,
  cogVideoX2B,
  wan21FastI2V,
  wan22I2V,
  zeroscopeV2,
  modelscopeT2V,
];

export function getProviderAdapters(): ProviderAdapter[] {
  return providerConfigs.map((c) => new GradioProviderAdapter(c));
}

export function getProviderByKey(key: string): ProviderAdapter | undefined {
  return getProviderAdapters().find((p) => p.key === key);
}

export function listModels() {
  return providerConfigs.map((c) => ({
    key: c.modelKey,
    providerKey: c.key,
    name: c.modelDisplayName,
    providerName: c.displayName,
    capabilities: c.capabilities,
    spaceUrl: c.spaceUrl,
    documentedQuota: c.documentedQuota,
    notes: c.notes || [],
  }));
}

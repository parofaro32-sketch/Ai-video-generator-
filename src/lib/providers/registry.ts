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

const ltxDistilled: GradioEndpointConfig = {
  key: 'ltx-video-distilled',
  displayName: 'Lightricks LTX-Video 0.9.8 Distilled (ZeroGPU Space)',
  modelKey: 'ltx-video-0.9.8-distilled',
  modelDisplayName: 'LTX-Video 0.9.8 13B Distilled',
  spaceUrl: 'https://lightricks-ltx-video-distilled.hf.space',
  apiNameText: 'text_to_video',
  apiNameImage: 'image_to_video',
  priority: 10,
  documentedQuota: 'Hugging Face ZeroGPU/public Space quota (dynamic, shared). Availability and queue depend on provider load.',
  notes: [
    'Verified running on ZeroGPU at integration time via Hugging Face Space runtime API.',
    'Supports text-to-video and image-to-video via Gradio API.',
    'Actual duration/resolution subject to model and Space limits.',
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
    const seed = input.seed ?? 42;
    const randomize = input.seed == null;
    return [
      input.prompt, // prompt
      input.negativePrompt ?? 'worst quality, inconsistent motion, blurry, jittery, distorted', // negative_prompt
      '', // input_image_filepath (not used)
      '', // input_video_filepath (not used)
      clamp32(height), // height_ui
      clamp32(width), // width_ui
      'text-to-video', // mode
      duration, // duration_ui
      9, // ui_frames_to_use (default)
      seed, // seed_ui
      randomize, // randomize_seed
      1, // ui_guidance_scale
      true, // improve_texture_flag
    ];
  },
  buildImageArgs: (input, uploadedImage) => {
    const { width, height } = dimsForAspect(input.aspectRatio);
    const duration = Math.max(0.3, Math.min(8.5, input.durationSec ?? 2));
    const seed = input.seed ?? 42;
    const randomize = input.seed == null;
    return [
      input.prompt, // prompt
      input.negativePrompt ?? 'worst quality, inconsistent motion, blurry, jittery, distorted', // negative_prompt
      uploadedImage, // input_image_filepath
      '', // input_video_filepath
      clamp32(height), // height_ui
      clamp32(width), // width_ui
      'image-to-video', // mode
      duration, // duration_ui
      9, // ui_frames_to_use
      seed, // seed_ui
      randomize, // randomize_seed
      1, // ui_guidance_scale
      true, // improve_texture_flag
    ];
  },
  extractVideo: (data) => {
    // expected: [ {video: FileData, subtitles: null}, seed ]
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
  displayName: 'ZhipuAI CogVideoX-2B (ZeroGPU Space)',
  modelKey: 'cogvideox-2b',
  modelDisplayName: 'CogVideoX-2B',
  spaceUrl: 'https://zai-org-cogvideox-2b-space.hf.space',
  apiNameText: 'generate',
  priority: 20,
  documentedQuota: 'Hugging Face ZeroGPU/public Space quota (dynamic, shared).',
  notes: [
    'Verified running on ZeroGPU at integration time.',
    'Text-to-video only (per exposed API). Fixed/default output characteristics may apply.',
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
      50, // num_inference_steps (default)
      6, // guidance_scale (default)
    ];
  },
  extractVideo: (data) => {
    // returns [video, download_video_file, download_gif_file]
    if (Array.isArray(data)) {
      const first = data[0] as any;
      if (first && typeof first === 'object') {
        if (first.video) return { file: first.video };
        if (first.path || first.url) return { file: first };
      }
      if (typeof first === 'string') return { file: first };
    }
    return null;
  },
};

export const providerConfigs: GradioEndpointConfig[] = [ltxDistilled, cogVideoX2B];

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

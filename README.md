# CineForge AI — Free Multi-Model AI Video Generator

Production-oriented Next.js (App Router, TypeScript) application for AI video generation using legitimate free/public open-source model inference endpoints, with automatic provider routing, fallback, job persistence, and a premium dark UI.

> **No fake generation. No hardcoded success. No paid GPU infrastructure or hidden paid APIs.** If no compatible free endpoint is available, the app reports an unavailable/waiting state.

## Features

- **Text-to-video** and **image-to-video** generation flows
- **Multi-model provider registry** with modular `ProviderAdapter` interface
- **Automatic provider routing & fallback** across compatible free endpoints (health checks, cooldowns, retry/fallback on provider failure, preserved prompt/settings)
- **Asynchronous job processing** with persistent jobs, status/progress polling, queue/error reporting, and duplicate-job prevention
- **Persistent video storage** outside the database (local filesystem in dev, Vercel Blob when configured) with history, downloads, and cleanup settings
- **Provider & usage dashboard**: availability, supported generation types, documented free quota (when known), queue/remaining quota only when exposed, last success/error, cooldowns
- **Long-video (scene-based) workflow**: project/scene metadata storage and FFmpeg clip stitching endpoint when FFmpeg is available in the environment (falls back to individual clips when unavailable)
- **Prompt enhancement** (local deterministic expansion, clearly labeled as not an external AI call), negative prompts (when supported), aspect ratios (16:9/9:16/1:1), duration/seed controls based on model capabilities
- **Authentication** (email/password, server-side sessions), server-side credentials, validated uploads/parameters
- **Premium dark cinematic UI** (responsive): Home, Generate, Explore Models, Generation History, My Videos, Settings, Usage & Provider Status

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend:** Next.js Route Handlers (Node.js runtime), Prisma ORM
- **Database:** PostgreSQL (compatible with Vercel Postgres/Neon/Supabase). Schema in `prisma/schema.prisma`.
- **Storage:** Local `.data/storage` in dev, or Vercel Blob in production (`BLOB_READ_WRITE_TOKEN`)
- **Provider integration:** Gradio HTTP API (`/gradio_api/call`, SSE event polling) for Hugging Face Spaces / ZeroGPU endpoints

## Architecture

- `src/lib/providers/types` & `gradio.ts` — unified `ProviderAdapter` (`getCapabilities`, `checkAvailability`, `getQuota`, `submitGeneration`, `getJobStatus`, `getResult`)
- `src/lib/providers/registry.ts` — model/provider registry and capability mapping
- `src/lib/providers/router.ts` — health checks, cooldowns, scoring, compatible provider selection and fallback ordering
- `src/lib/jobs/service.ts` — job creation, duplicate prevention, submission, polling/ticking, fallback, result download, persistence
- `src/lib/storage/` — storage abstraction (local/Vercel Blob)
- `src/lib/auth/` — password hashing, DB-backed sessions, guards
- `src/app/api/*` — auth, jobs, providers/status, upload, videos, cleanup, projects, storage serving

## Verified Free Endpoints Investigated (as of 2026-11-16)

Runtime/availability checked via Hugging Face Spaces API and endpoint config/info.

| Model | Provider / Space | Type | Status at check | Integration |
|---|---|---|---|---|
| LTX-Video 0.9.8 13B Distilled | `Lightricks/ltx-video-distilled` (ZeroGPU, RUNNING) | T2V + I2V | **Verified running** | **Integrated & tested successfully** |
| CogVideoX-2B | `zai-org/CogVideoX-2B-Space` (ZeroGPU, RUNNING) | T2V | Verified running | Integrated (adapter configured) |
| Wan 2.2 (I2V variants) | e.g. `prithivMLmods/Wan2.2-Fast`, `amisima/Wan_2.2_I2V_Studio` (ZeroGPU, RUNNING) | I2V (custom APIs) | Verified running | Investigated; not yet integrated due non-standard/custom per-space API contracts |
| HunyuanVideo 1.5 I2V | `multimodalart/Hunyuan-Video-1-5` (ZeroGPU, RUNNING) | I2V | Verified running | Investigated |
| Wan2.1 (official) | `Wan-AI/Wan2.1` | — | RUNTIME_ERROR at check | Not usable/integrated |
| Wan 2.2 S2V | `Wan-AI/Wan2.2-S2V` (cpu-basic) | Speech-to-video | Running (different modality) | Not integrated as T2V/I2V |
| Mochi / SVD / others | Various spaces searched | varies | Mixed/no standard free T2V-I2V API verified | Investigated; only verified compatible endpoints integrated |

Notes: free/public Space availability, quotas, and APIs change frequently. The app reports live status and does not count unavailable providers as usable capacity. Different Spaces may share quotas; quotas are not assumed independent or unlimited.

## Real End-to-End Generation Tests (documented)

Tests executed against the running application (local Postgres, local storage) with real Hugging Face ZeroGPU Gradio API calls — no fake generation.

| # | Type | Model / Provider | Job ID | Provider event | Result | Output |
|---|---|---|---|---|---|---|
| 1 | Text-to-video | `ltx-video-0.9.8-distilled` / Lightricks LTX-Video 0.9.8 Distilled (ZeroGPU) | `cmwju3pwf0001hxyugz8z0sn7` | `text_to_video:03ea95c818f6495e8287434a75830182` | **Succeeded** | 68,853 bytes MP4, seed 46396839, stored & downloadable |
| 2 | Image-to-video | `ltx-video-0.9.8-distilled` / Lightricks LTX-Video 0.9.8 Distilled (ZeroGPU) | `cmwju8s3o0001hx9zvn1lrqzo` | `image_to_video:6113be295e9e4521941db002065a6903` | **Succeeded** | 11,036 bytes MP4, seed 357700654, stored & downloadable |

Prompt/settings were preserved, job status/progress/events persisted, provider result downloaded and stored outside DB, and video served via storage endpoint. CogVideoX-2B adapter is configured for a verified-running ZeroGPU space but was not live-tested in this run to conserve shared free quota; routing/fallback logic and provider dashboard are implemented.

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL database (local, Vercel Postgres, Neon, Supabase, etc.)

### Install & configure
```bash
npm install
cp .env.example .env
# edit .env: DATABASE_URL, AUTH_SECRET (and optional BLOB_READ_WRITE_TOKEN, HF_TOKEN)
```

### Database
```bash
npx prisma db push
# or: npx prisma migrate dev
```

### Development
```bash
npm run dev
```

### Production build
```bash
npm run build
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. The app also auto-detects `POSTGRES_PRISMA_URL`/`POSTGRES_URL` (Vercel Postgres integration) if `DATABASE_URL` is unset. |
| `AUTH_SECRET` | Yes (prod) | Long random secret for auth/session security context |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob token for persistent video storage on Vercel (falls back to local `.data/storage`) |
| `HF_TOKEN` | No | Optional Hugging Face token for authenticated access to spaces where permitted (never exposed to client) |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL |

## Vercel Deployment

1. Provision PostgreSQL (Vercel Postgres/Neon) and connect it to the project so `DATABASE_URL` (or `POSTGRES_PRISMA_URL`) is available to runtime and build environments.
2. Set `AUTH_SECRET` and optionally `BLOB_READ_WRITE_TOKEN` for durable video storage (recommended on Vercel; serverless filesystem is ephemeral).
3. Run `npx prisma db push` once against the production database (creates tables required for sign-up/auth/jobs/history).
4. Redeploy with build cache cleared if needed. Generation jobs advance via status polling (serverless-friendly). Long FFmpeg stitching requires an environment with FFmpeg available; otherwise clips remain downloadable individually.

## Security & Compliance

- Credentials/tokens are server-side only (env vars), never sent to the browser.
- Auth required for generation/history/video/upload/cleanup endpoints; uploaded images validated (type, size, magic bytes).
- Provider quotas, rate limits, CAPTCHA, and terms are respected; no bypass/rotation/fake accounts.
- No fake/simulated/hardcoded generation results. No paid GPU or hidden paid API fallbacks.

## Limitations

- Free/public inference endpoints are quota-limited, may queue, change APIs, or become unavailable; the app surfaces this honestly.
- Many open-source video models produce short clips; longer videos are handled as scene workflows (stitching depends on FFmpeg availability).
- Exact remaining quotas/queue positions are shown only when providers expose them.
- Vercel serverless execution limits mean job progression relies on polling/status checks; very long provider queues may require repeated polling.

import Link from 'next/link';
import { ArrowRight, Cpu, Film, Layers, ShieldCheck, Sparkles, Zap } from 'lucide-react';

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.28),transparent_65%)] blur-2xl" />
        </div>
        <div className="container-page relative py-20 sm:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 badge badge-info mb-5 px-3 py-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" /> Multi-model engine · Free/public endpoints · Automatic fallback
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
              Generate AI videos from <span className="bg-gradient-to-r from-[#7c5cff] via-[#5b8cff] to-[#22d3ee] bg-clip-text text-transparent">text and images</span>
            </h1>
            <p className="mt-5 text-lg text-[var(--muted)] max-w-2xl">
              CineForge routes your prompts across verified open-source video models and legitimate free inference providers. Text-to-video, image-to-video, scene-by-scene long video workflows, persistent history, and real provider status — no fake generation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/generate" className="btn btn-primary text-base px-6 py-3"><Sparkles className="h-4 w-4" /> Start Generating <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/models" className="btn text-base px-6 py-3"><Cpu className="h-4 w-4" /> Explore Models</Link>
              <Link href="/usage" className="btn text-base px-6 py-3">Provider Status</Link>
            </div>
          </div>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Sparkles, title: 'Text & Image to Video', desc: 'Create motion from prompts or animate a source image with supported open-source models.' },
              { icon: Layers, title: 'Automatic Provider Routing', desc: 'Checks availability, tries compatible free endpoints, and falls back on failures while preserving your prompt and settings.' },
              { icon: Film, title: 'Longer Video Workflows', desc: 'Generate consecutive scenes, keep prompts/settings per scene, and combine completed clips when FFmpeg is available in the environment.' },
              { icon: Cpu, title: 'Multi-Model Registry', desc: 'Modular adapters for LTX-Video, CogVideoX, Wan and other models as verified free endpoints are available.' },
              { icon: ShieldCheck, title: 'Honest & Secure', desc: 'No fake results, no hardcoded success, server-side credentials, validated inputs, and clear unavailable states.' },
              { icon: Zap, title: 'Persistent History', desc: 'Track jobs, store outputs, download videos, review model/provider metadata and timestamps.' },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="glass card p-5">
                  <div className="h-10 w-10 rounded-xl bg-white/5 border border-[var(--border)] flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-[#22d3ee]" />
                  </div>
                  <h3 className="font-semibold text-lg">{f.title}</h3>
                  <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="container-page">
        <div className="glass card p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div>
            <h2 className="text-2xl font-semibold">Ready to generate?</h2>
            <p className="text-[var(--muted)] mt-1">Sign in, choose a model or automatic routing, and submit a real generation job. Results depend on live provider availability.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/register" className="btn btn-primary">Create account</Link>
            <Link href="/generate" className="btn">Open generator</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// Headless DSL → finished MP4, no browser involved.
//
// Renders every frame with the same deterministic renderFrame that drives the
// player, synthesizes the narration with Kokoro (npm build, CPU), simulates
// the Conductor over virtual time to collect every sound effect, mixes voice +
// sfx in pure JS, and muxes it all through ffmpeg. Faster than realtime on
// most machines and perfect for batch-rendering a whole course in CI.
//
//   npx tsx scripts/render-video.mts lesson.json out.mp4 [--voice af_heart] [--no-voice]
//   npx tsx scripts/render-video.mts lessons-dir/ out-dir/            # batch
//   npx tsx scripts/render-video.mts --sample out.mp4                 # demo DSL
//
// First voice run downloads the Kokoro model (~90 MB, cached by huggingface).

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { AnimationDSL } from '../lib/types';
import { normalizeDSL, repace, paceToNarration } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';
import { Conductor } from '../lib/conductor';
import { SfxCollector, SfxEvent, SampleBuffers } from '../lib/sounds';
import { splitSentences, stitchClips } from '../lib/narration';
import { prosodyPlan } from '../lib/prosody';
import { hasStepNarration, stepStartsFromSentences } from '../lib/step-sync';
import { SynthesizedClip } from '../lib/tts';
import { WordTiming, buildWordTimeline, SentenceClipInfo } from '../lib/word-timeline';

const MIX_RATE = 48000;

// ── Fonts ───────────────────────────────────────────────────────────────────────
for (const p of [
  '/System/Library/Fonts/Menlo.ttc',
  '/System/Library/Fonts/Monaco.ttf',
  '/Library/Fonts/Courier New.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
]) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); break; } catch {} }
}

// ── Minimal AudioBuffer stand-in (what Conductor/SfxCollector actually touch) ──
function fakeBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  return {
    duration: samples.length / sampleRate,
    length: samples.length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

// ── WAV decode (PCM16 / float32 mono-or-stereo → mono Float32) ─────────────────
function decodeWav(buf: Buffer): { samples: Float32Array; sampleRate: number } | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  let off = 12;
  let fmt = { format: 1, channels: 1, rate: 44100, bits: 16 };
  let data: Buffer | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        rate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      };
    } else if (id === 'data') {
      data = buf.subarray(off + 8, off + 8 + size);
    }
    off += 8 + size + (size % 2);
  }
  if (!data) return null;
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let v = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const at = (i * fmt.channels + c) * bytes;
      v += fmt.format === 3 && fmt.bits === 32
        ? data.readFloatLE(at)
        : data.readInt16LE(at) / 32768;
    }
    out[i] = v / fmt.channels;
  }
  return { samples: out, sampleRate: fmt.rate };
}

function loadSfx(): SampleBuffers {
  const load = (name: string): AudioBuffer | undefined => {
    const p = join(process.cwd(), 'public', 'sounds', name);
    if (!existsSync(p)) return undefined;
    const d = decodeWav(readFileSync(p));
    return d ? fakeBuffer(d.samples, d.sampleRate) : undefined;
  };
  return {
    keys: ['key-1.wav', 'key-2.wav', 'key-3.wav', 'key-4.wav', 'key-5.wav']
      .map(load).filter(Boolean) as AudioBuffer[],
    space: load('space.wav'),
    enter: load('enter.wav'),
    click: load('click.wav'),
    whoosh: load('whoosh.wav'),
    pop: load('pop.wav'),
    chime: load('chime.wav'),
    buzz: load('buzz.wav'),
  };
}

// ── Pure-JS mix: events → interleaved stereo PCM16 WAV ──────────────────────────
function mixToWav(events: SfxEvent[], duration: number): Buffer {
  const frames = Math.ceil((duration + 0.3) * MIX_RATE);
  const L = new Float32Array(frames);
  for (const ev of events) {
    if (ev.stopAt != null && ev.stopAt <= ev.at + 1e-3) continue;
    const src = ev.buffer.getChannelData(0);
    const srcRate = ev.buffer.sampleRate * ev.rate; // playbackRate = faster read
    const startFrame = Math.max(0, Math.round(ev.at * MIX_RATE));
    const srcStart = (ev.offset ?? 0) * ev.buffer.sampleRate;
    const maxOut = ev.stopAt != null
      ? Math.min(frames, Math.round(ev.stopAt * MIX_RATE))
      : frames;
    const outLen = Math.min(
      Math.floor(((src.length - srcStart) / srcRate) * MIX_RATE),
      maxOut - startFrame,
    );
    for (let i = 0; i < outLen; i++) {
      const pos = srcStart + (i / MIX_RATE) * srcRate;
      const i0 = Math.floor(pos);
      if (i0 + 1 >= src.length) break;
      const frac = pos - i0;
      L[startFrame + i] += (src[i0] * (1 - frac) + src[i0 + 1] * frac) * ev.gain;
    }
  }
  // soft clip + PCM16 stereo (mono mix duplicated)
  const pcm = Buffer.alloc(44 + frames * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + frames * 4, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(MIX_RATE, 24);
  pcm.writeUInt32LE(MIX_RATE * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-1, Math.min(1, Math.tanh(L[i] * 1.1)));
    const s = Math.round(v * 32767);
    pcm.writeInt16LE(s, 44 + i * 4);
    pcm.writeInt16LE(s, 44 + i * 4 + 2);
  }
  return pcm;
}

// ── Narration (Kokoro npm, sentence by sentence, with word timeline) ────────────
async function synthesizeNarration(dsl: AnimationDSL, voice: string) {
  const { KokoroTTS } = await import('kokoro-js');
  console.log('loading Kokoro voice model (cached after first run)…');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8', device: 'cpu',
  } as any);

  const cache = new Map<string, SynthesizedClip>();
  const synth = async (text: string, speed = 1): Promise<SynthesizedClip> => {
    const key = `${speed}::${text}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const audio: any = await tts.generate(text, { voice: voice as any, speed });
    const samples: Float32Array = audio.audio ?? audio.data;
    const sampleRate: number = audio.sampling_rate ?? 24000;
    const clip = { samples, sampleRate, duration: samples.length / sampleRate };
    cache.set(key, clip);
    return clip;
  };

  const buffers = new Map<number, AudioBuffer>();
  const durations = new Map<number, number>();
  const words = new Map<number, WordTiming[]>();
  const stepSync = new Map<number, number[]>();
  const narrated = dsl.scenes
    .map((s, i) => ({ i, sentences: s.narration ? splitSentences(s.narration) : [] }))
    .filter((x) => x.sentences.length > 0);

  const total = narrated.reduce((a, n) => a + n.sentences.length, 0);
  let done = 0;
  for (const { i, sentences } of narrated) {
    const plan = prosodyPlan(sentences);
    const gaps = plan.map((p) => p.gapAfter);
    const clips: SynthesizedClip[] = [];
    const infos: SentenceClipInfo[] = [];
    let offset = 0;
    for (let k = 0; k < sentences.length; k++) {
      const clip = await synth(sentences[k], plan[k].speed);
      clips.push(clip);
      infos.push({ text: sentences[k], offset, samples: clip.samples, sampleRate: clip.sampleRate });
      offset += clip.samples.length / clip.sampleRate + gaps[k];
      process.stdout.write(`\rnarration ${++done}/${total}`);
    }
    const stitched = stitchClips(clips, gaps);
    buffers.set(i, fakeBuffer(stitched.samples, stitched.sampleRate));
    durations.set(i, stitched.duration);
    words.set(i, buildWordTimeline(infos));

    // per-step sync: a step starts when its first narration sentence is spoken
    const scene = dsl.scenes[i];
    if (scene.type === 'ide' && hasStepNarration(scene.steps)) {
      const starts = stepStartsFromSentences(scene.steps, sentences.length, infos.map((x) => x.offset));
      stepSync.set(i, starts);
      process.stdout.write(`\nide scene ${i}: ${starts.length} steps voice-synced at ${starts.map((t) => t.toFixed(1)).join('s, ')}s\n`);
    }
  }
  if (total) process.stdout.write('\n');
  const paced = paceToNarration(dsl, durations);
  stepSync.forEach((times, i) => {
    const s = paced.scenes[i];
    if (s.type === 'ide') s.stepNarrationTimes = times;
  });
  return { dsl: paced, buffers, words };
}

// ── One lesson → one MP4 ────────────────────────────────────────────────────────
async function renderOne(raw: any, outPath: string, voice: string, voiceOn: boolean) {
  let dsl = repace(normalizeDSL(raw));
  let buffers = new Map<number, AudioBuffer>();
  let words = new Map<number, WordTiming[]>();
  if (voiceOn && dsl.scenes.some((s) => s.narration)) {
    const res = await synthesizeNarration(dsl, voice);
    dsl = res.dsl;
    buffers = res.buffers;
    words = res.words;
  }

  const prep = await prepare(dsl);
  prep.words = words;

  // audio: simulate the conductor over virtual time → mix
  const collector = new SfxCollector(loadSfx());
  const conductor = new Conductor(collector);
  conductor.setNarration(buffers);
  conductor.reset(0);
  const step = 1 / dsl.fps;
  for (let t = step; t <= dsl.duration + step; t += step) {
    collector.now = Math.min(t, dsl.duration);
    conductor.tick(prep, collector.now);
  }
  for (const ev of collector.events) {
    if (ev.kind === 'voice' && ev.stopAt != null && ev.stopAt >= dsl.duration - 1e-3) ev.stopAt = undefined;
  }
  const events = dsl.sfx === false ? collector.events.filter((e) => e.kind === 'voice') : collector.events;
  const wavPath = join(tmpdir(), `newani-mix-${Date.now()}.wav`);
  writeFileSync(wavPath, mixToWav(events, dsl.duration));

  // video: raw BGRA frames piped into ffmpeg alongside the wav
  const canvas = createCanvas(dsl.width, dsl.height);
  const ctx = canvas.getContext('2d');
  const ff = spawn('ffmpeg', [
    '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${dsl.width}x${dsl.height}`,
    '-r', String(dsl.fps), '-i', '-',
    '-i', wavPath,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
    outPath,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr += d; });
  const ffDone = new Promise<void>((res, rej) => {
    ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}\n${ffErr.slice(-800)}`))));
  });

  const totalFrames = Math.ceil(dsl.duration * dsl.fps) + 1;
  const t0 = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    renderFrame(ctx as unknown as CanvasRenderingContext2D, prep, Math.min(i / dsl.fps, dsl.duration));
    const img = ctx.getImageData(0, 0, dsl.width, dsl.height); // RGBA
    const buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    await new Promise<void>((res, rej) => ff.stdin.write(buf, (e) => (e ? rej(e) : res())));
    if (i % dsl.fps === 0) process.stdout.write(`\rframe ${i}/${totalFrames}`);
  }
  ff.stdin.end();
  await ffDone;
  rmSync(wavPath, { force: true });
  const wall = (Date.now() - t0) / 1000;
  console.log(`\rwrote ${outPath} — ${dsl.duration.toFixed(1)}s of video in ${wall.toFixed(1)}s (${(dsl.duration / wall).toFixed(1)}x realtime)`);
}

// ── Sample DSL (voice-paced smoke test) ─────────────────────────────────────────
const SAMPLE = {
  title: 'Sample — f-strings',
  scenes: [
    { type: 'title', text: 'Python f-strings', subtitle: 'sixty seconds', narration: "Ever glued strings together with plus signs and hated it? There's a better way." },
    { type: 'code', language: 'python', code: "name = 'Ada'\nprint(f'Hello, {name}!')", title: 'main.py', typingSpeed: 18, narration: "Put an f before the quote, and now braces are little windows into your variables. That's the whole trick." },
    { type: 'highlight', startLine: 2, endLine: 2, syncWord: 'braces', duration: 2 },
    { type: 'terminal', output: 'Hello, Ada!', typingSpeed: 40, narration: "And there's our greeting — no plus signs in sight." },
    { type: 'beat', duration: 0.7 },
    { type: 'bullets', title: 'Remember', items: ['f before the quote', 'braces evaluate code', 'readable beats clever'], narration: "Three things to keep. The f goes before the quote. Braces run real expressions. And readable code wins." },
  ],
};

// ── CLI ─────────────────────────────────────────────────────────────────────────
/** --shorts: vertical 1080x1920; --scenes a-b: teaser cut (repace re-times it). */
function applyFlags(raw: any, args: string[]): any {
  const out = { ...raw };
  if (args.includes('--shorts')) { out.width = 1080; out.height = 1920; }
  const si = args.indexOf('--scenes');
  if (si >= 0 && Array.isArray(out.scenes)) {
    const [a, b] = String(args[si + 1] || '').split('-').map((n) => parseInt(n, 10));
    if (isFinite(a)) out.scenes = out.scenes.slice(a, isFinite(b) ? b + 1 : a + 1);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const voiceOn = !args.includes('--no-voice');
  const voice = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'af_heart';
  const flagVals = new Set([args.indexOf('--voice') + 1, args.indexOf('--scenes') + 1].filter((i) => i > 0));
  const positional = args.filter((a, i) => !a.startsWith('--') && !flagVals.has(i));

  if (args.includes('--sample')) {
    await renderOne(applyFlags(SAMPLE, args), positional[0] || 'sample.mp4', voice, voiceOn);
    return;
  }
  const [input, output] = positional;
  if (!input) {
    console.error('usage: npx tsx scripts/render-video.mts <lesson.json | dir> <out.mp4 | out-dir> [--voice af_heart] [--no-voice] [--shorts] [--scenes 0-3]\n       npx tsx scripts/render-video.mts --sample out.mp4');
    process.exit(1);
  }
  if (statSync(input).isDirectory()) {
    const outDir = output || 'renders';
    mkdirSync(outDir, { recursive: true });
    for (const f of readdirSync(input).filter((f) => f.endsWith('.json'))) {
      const name = basename(f, '.json');
      console.log(`\n=== ${name} ===`);
      await renderOne(applyFlags(JSON.parse(readFileSync(join(input, f), 'utf8')), args), join(outDir, `${name}.mp4`), voice, voiceOn);
    }
  } else {
    await renderOne(applyFlags(JSON.parse(readFileSync(input, 'utf8')), args), output || 'lesson.mp4', voice, voiceOn);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

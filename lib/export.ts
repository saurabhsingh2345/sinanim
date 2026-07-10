import { Prepared, renderFrame } from './renderer';
import { SfxCollector, SoundEngine, renderSfxMix } from './sounds';
import { Conductor } from './conductor';

export function pickMime(): string {
  const candidates = [
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return 'video/webm';
}

export interface RecordResult {
  blob: Blob;
  ext: string;
}

/**
 * Play the timeline through in real time, rendering each frame to `canvas` and
 * letting the Conductor fire sounds. A MediaRecorder captures the canvas frames
 * plus the synthesized audio into a single downloadable file. Real-time capture
 * keeps audio/video perfectly in sync.
 */
export async function recordVideo(
  canvas: HTMLCanvasElement,
  prep: Prepared,
  engine: SoundEngine,
  onProgress?: (ratio: number) => void,
  narration?: Map<number, AudioBuffer>,
): Promise<RecordResult> {
  const ctx = canvas.getContext('2d')!;
  const { dsl } = prep;
  const fps = dsl.fps;

  await engine.resume();

  const stream = canvas.captureStream(fps);
  const audio = engine.captureStream;
  if (audio) audio.getAudioTracks().forEach((t) => stream.addTrack(t));

  const mimeType = pickMime();
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  const rec = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 12_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => {
    rec.onstop = () => res();
  });

  const conductor = new Conductor(engine);
  if (narration) conductor.setNarration(narration);
  conductor.reset(0);
  rec.start();

  const start = performance.now();
  const total = dsl.duration + 0.2; // small tail so last frame lands

  await new Promise<void>((resolve) => {
    const loop = () => {
      const time = (performance.now() - start) / 1000;
      const t = Math.min(time, dsl.duration);
      renderFrame(ctx, prep, t);
      conductor.tick(prep, t);
      onProgress?.(Math.min(1, time / total));
      if (time >= total) resolve();
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  rec.stop();
  await stopped;
  onProgress?.(1);
  return { blob: new Blob(chunks, { type: mimeType }), ext };
}

// ── Fast export (WebCodecs) ─────────────────────────────────────────────────────
// Renders frames as fast as the encoder can take them (typically 4–10× faster
// than real time) instead of playing the timeline through a MediaRecorder.
// Audio is pre-mixed offline by simulating the Conductor over virtual time, so
// the file sounds identical to the realtime path. Falls back to `recordVideo`
// when WebCodecs/AAC isn't available (see `exportVideo`).

function supportsWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof OfflineAudioContext !== 'undefined'
  );
}

const AVC_CANDIDATES = ['avc1.640028', 'avc1.4d0028', 'avc1.42e01f'];

async function pickAvcCodec(width: number, height: number, fps: number): Promise<string | null> {
  for (const codec of AVC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec, width, height, framerate: fps, bitrate: 12_000_000,
      });
      if (supported) return codec;
    } catch { /* try next */ }
  }
  return null;
}

/** Simulate the Conductor tick-by-tick to collect every sound with its time. */
function collectAudioEvents(
  prep: Prepared,
  engine: SoundEngine,
  narration?: Map<number, AudioBuffer>,
): SfxCollector {
  const collector = new SfxCollector(engine.sampleBuffers);
  const conductor = new Conductor(collector);
  if (narration) conductor.setNarration(narration);
  conductor.reset(0);
  const step = 1 / prep.dsl.fps;
  for (let t = step; t <= prep.dsl.duration + step; t += step) {
    collector.now = Math.min(t, prep.dsl.duration);
    conductor.tick(prep, collector.now);
  }
  collector.stopNarration(); // close out stopAt bookkeeping — clips ring out
  // narration clips should ring out fully, not cut at the last tick
  for (const ev of collector.events) {
    if (ev.kind === 'voice' && ev.stopAt != null && ev.stopAt >= prep.dsl.duration - 1e-3) {
      ev.stopAt = undefined;
    }
  }
  return collector;
}

export async function recordVideoFast(
  canvas: HTMLCanvasElement,
  prep: Prepared,
  engine: SoundEngine,
  onProgress?: (ratio: number) => void,
  narration?: Map<number, AudioBuffer>,
): Promise<RecordResult> {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const { dsl } = prep;
  const fps = dsl.fps;
  const W = canvas.width;
  const H = canvas.height;

  const codec = await pickAvcCodec(W, H, fps);
  if (!codec) throw new Error('No supported H.264 encoder config');

  const audioCfg = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 };
  const audioOk = (await AudioEncoder.isConfigSupported(audioCfg)).supported;
  if (!audioOk) throw new Error('AAC encoding unsupported');

  await engine.resume();

  // ── audio: simulate → offline mix → AAC ──
  const collector = collectAudioEvents(prep, engine, narration);
  const events =
    dsl.sfx === false ? collector.events.filter((e) => e.kind === 'voice') : collector.events;
  const mix = await renderSfxMix(events, dsl.duration, audioCfg.sampleRate);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    audio: { codec: 'aac', sampleRate: audioCfg.sampleRate, numberOfChannels: 2 },
    fastStart: 'in-memory',
  });

  let encodeError: unknown = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });
  videoEncoder.configure({ codec, width: W, height: H, framerate: fps, bitrate: 12_000_000 });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });
  audioEncoder.configure(audioCfg);

  // audio first (fast — pure memory)
  const FRAMES = audioCfg.sampleRate / 2; // 0.5s planar chunks
  for (let off = 0; off < mix.length; off += FRAMES) {
    const n = Math.min(FRAMES, mix.length - off);
    const data = new Float32Array(n * 2);
    for (let ch = 0; ch < 2; ch++) {
      data.set(mix.getChannelData(ch).subarray(off, off + n), ch * n);
    }
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: mix.sampleRate,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round((off / mix.sampleRate) * 1e6),
      data,
    });
    audioEncoder.encode(ad);
    ad.close();
  }

  // video frames, as fast as the encoder drains
  const ctx = canvas.getContext('2d')!;
  const totalFrames = Math.ceil(dsl.duration * fps) + 1;
  const keyEvery = fps * 2;
  for (let i = 0; i < totalFrames; i++) {
    if (encodeError) throw encodeError;
    const t = Math.min(i / fps, dsl.duration);
    renderFrame(ctx, prep, t);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(i * (1e6 / fps)),
      duration: Math.round(1e6 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % keyEvery === 0 });
    frame.close();
    onProgress?.(Math.min(0.97, i / totalFrames));
    // backpressure + keep the tab responsive
    while (videoEncoder.encodeQueueSize > 4) {
      await new Promise((r) => setTimeout(r, 1));
    }
    if (i % 12 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
  if (encodeError) throw encodeError;
  muxer.finalize();
  onProgress?.(1);
  const { buffer } = muxer.target as InstanceType<typeof ArrayBufferTarget>;
  return { blob: new Blob([buffer], { type: 'video/mp4' }), ext: 'mp4' };
}

/**
 * Export the timeline: WebCodecs fast path (seconds, not minutes) when the
 * browser supports it, realtime MediaRecorder capture otherwise.
 */
export async function exportVideo(
  canvas: HTMLCanvasElement,
  prep: Prepared,
  engine: SoundEngine,
  onProgress?: (ratio: number) => void,
  narration?: Map<number, AudioBuffer>,
): Promise<RecordResult> {
  if (supportsWebCodecs()) {
    try {
      return await recordVideoFast(canvas, prep, engine, onProgress, narration);
    } catch (e) {
      console.warn('Fast export unavailable, falling back to realtime capture:', e);
    }
  }
  return recordVideo(canvas, prep, engine, onProgress, narration);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Browser-safe stub. MediaRecorder output is already downloadable.
 * For Node remux, import `finalizeWithFFmpegNode` from `./export-ffmpeg` in scripts/API only.
 */
export async function finalizeWithFFmpeg(
  blob: Blob,
  ext: string,
): Promise<RecordResult> {
  return { blob, ext };
}


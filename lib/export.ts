import { Prepared, renderFrame } from './renderer';
import { SoundEngine } from './sounds';
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

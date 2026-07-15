// Standalone Kokoro TTS CLI: turn a plain-text script into a narration WAV.
//
//   npx tsx scripts/tts-cli.mts <input.txt> <output.wav> [--voice af_heart] [--speed 1]
//
// This is the Node entry point the Studio "Voiceover (Kokoro)" generator calls.
// It mirrors the in-browser narration pipeline (lib/tts.ts): the model is the
// same ~90 MB Kokoro-82M ONNX build, cached after first run, and long text is
// spoken sentence-by-sentence (kokoro's built-in splitter) with a short breath
// gap between sentences so paragraphs don't run together.
import { readFileSync, writeFileSync } from 'node:fs';
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';

const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: tts-cli.mts <input.txt> <output.wav> [--voice v] [--speed n]');
  process.exit(2);
}

let voice = 'af_heart';
let speed = 1;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--voice' && rest[i + 1]) voice = rest[++i];
  else if (rest[i] === '--speed' && rest[i + 1]) speed = parseFloat(rest[++i]) || 1;
}

const text = readFileSync(inPath, 'utf8').trim();
if (!text) {
  console.error('input text is empty');
  process.exit(1);
}

console.log(`loading Kokoro (voice=${voice}, speed=${speed})…`);
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8',
  device: 'cpu',
});

let sampleRate = 24000;
const parts: Float32Array[] = [];
const breathGap = () => new Float32Array(Math.round(sampleRate * 0.25)); // 250 ms

// Feed the built-in sentence splitter ourselves and CLOSE it — kokoro-js's
// stream(string) helper never closes its internal splitter, so the async
// iterator hangs after the buffered sentences and drops the trailing one.
const splitter = new TextSplitterStream();
splitter.push(text);
splitter.close();

let spoken = 0;
for await (const { text: sentence, audio } of tts.stream(splitter, { voice, speed })) {
  const samples: Float32Array = (audio as any).audio ?? (audio as any).data;
  sampleRate = (audio as any).sampling_rate ?? sampleRate;
  if (!(samples instanceof Float32Array) || samples.length === 0) continue;
  if (parts.length) parts.push(breathGap());
  parts.push(samples);
  spoken++;
  console.log(`  ${spoken}. ${sentence.trim().slice(0, 70)}`);
}

if (!parts.length) {
  console.error('Kokoro produced no audio');
  process.exit(1);
}

const total = parts.reduce((n, p) => n + p.length, 0);
const merged = new Float32Array(total);
let offset = 0;
for (const p of parts) {
  merged.set(p, offset);
  offset += p.length;
}

writeFileSync(outPath, encodeWav(merged, sampleRate));
console.log(`wrote ${outPath} — ${(total / sampleRate).toFixed(2)}s, ${sampleRate}Hz mono`);

/** Encode mono Float32 PCM to a 16-bit WAV container (44-byte header). */
function encodeWav(samples: Float32Array, rate: number): Buffer {
  const frames = samples.length;
  const buf = Buffer.alloc(44 + frames * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); // byte rate (rate * blockAlign)
  buf.writeUInt16LE(2, 32); // block align (mono * 16-bit)
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(frames * 2, 40);
  let off = 44;
  for (let i = 0; i < frames; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), off);
    off += 2;
  }
  return buf;
}

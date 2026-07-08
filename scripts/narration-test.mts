// Opt-in smoke test for the Kokoro TTS pipeline (downloads the ~90 MB model on
// first run, cached afterwards): synthesizes one narration line in Node and
// verifies the sample/format assumptions lib/tts.ts makes.
import { KokoroTTS } from 'kokoro-js';

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8',
  device: 'cpu',
});

const audio = await tts.generate(
  "Welcome! Today we'll learn how f-strings work in Python.",
  { voice: 'af_heart' },
);

const samples: Float32Array = (audio as any).audio ?? (audio as any).data;
const rate: number = (audio as any).sampling_rate ?? 24000;
console.log('samples:', samples?.constructor?.name, samples?.length);
console.log('sampleRate:', rate);
console.log('duration:', (samples.length / rate).toFixed(2), 's');
if (!(samples instanceof Float32Array) || samples.length < 1000) {
  throw new Error('unexpected audio payload');
}
await (audio as any).save?.('scripts/narration-test.wav');
console.log('wrote scripts/narration-test.wav');

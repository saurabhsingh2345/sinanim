// Synthesizes the app's sound set into public/sounds/*.wav — no samples, no
// licenses, fully reproducible. Run: npx tsx scripts/generate-sounds.mts
//
// The keyboard voice is a soft "thock": a low damped body + a filtered noise
// tap, tuned per variant so round-robin playback never sounds like a loop.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds');
mkdirSync(OUT, { recursive: true });

// deterministic RNG so regenerating produces identical files
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── tiny DSP helpers ───────────────────────────────────────────────────────────
function onePoleLP(input: Float64Array, cutoff: (i: number) => number): Float64Array {
  const out = new Float64Array(input.length);
  let y = 0;
  for (let i = 0; i < input.length; i++) {
    const a = 1 - Math.exp((-2 * Math.PI * cutoff(i)) / SR);
    y += a * (input[i] - y);
    out[i] = y;
  }
  return out;
}

function onePoleHP(input: Float64Array, cutoffHz: number): Float64Array {
  const lp = onePoleLP(input, () => cutoffHz);
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] - lp[i];
  return out;
}

function mix(target: Float64Array, src: Float64Array, gain: number, offsetSec = 0) {
  const off = Math.floor(offsetSec * SR);
  for (let i = 0; i < src.length && off + i < target.length; i++) {
    target[off + i] += src[i] * gain;
  }
}

function normalize(buf: Float64Array, peak = 0.82) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] / max) * peak;
}

function seconds(n: number) { return new Float64Array(Math.floor(n * SR)); }

function sine(freq: number, dur: number, decay: number, phase = 0): Float64Array {
  const out = seconds(dur);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * freq * t + phase) * Math.exp(-t / decay);
  }
  return out;
}

function noise(dur: number, rand: () => number): Float64Array {
  const out = seconds(dur);
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 - 1;
  return out;
}

function envelopeExp(buf: Float64Array, decay: number, attack = 0) {
  const atk = Math.floor(attack * SR);
  for (let i = 0; i < buf.length; i++) {
    const t = i / SR;
    let e = Math.exp(-t / decay);
    if (i < atk) e *= i / atk;
    buf[i] *= e;
  }
}

function writeWav(name: string, buf: Float64Array) {
  const n = buf.length;
  const data = Buffer.alloc(44 + n * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, name), data);
  console.log(`wrote ${name} (${(n / SR * 1000).toFixed(0)}ms)`);
}

// ── keyboard ───────────────────────────────────────────────────────────────────
/** One key thock: low body + mid knock + brief noise tap, all damped fast.
 *  Tuned DULL on purpose — the tap is low-passed and quiet so long typing
 *  passages sit under the voice instead of fighting it (the bright 2.5kHz
 *  clatter was the #1 listener complaint). */
function keySound(bodyHz: number, knockHz: number, decay: number, tapGain: number, seed: number): Float64Array {
  const rand = mulberry32(seed);
  const out = seconds(0.14);
  mix(out, sine(bodyHz, 0.12, decay), 1.0);
  mix(out, sine(knockHz, 0.06, decay * 0.4), 0.22);
  const tap = onePoleLP(onePoleHP(noise(0.02, rand), 900), () => 2200);
  envelopeExp(tap, 0.005);
  mix(out, tap, tapGain);
  normalize(out, 0.55);
  return out;
}

for (let v = 0; v < 5; v++) {
  const body = 138 + v * 9; // each variant sits on its own pitch
  const knock = 460 + v * 55;
  writeWav(`key-${v + 1}.wav`, keySound(body, knock, 0.028 + v * 0.002, 0.22, 100 + v));
}
writeWav('space.wav', keySound(104, 380, 0.038, 0.16, 200));
writeWav('enter.wav', keySound(88, 330, 0.05, 0.18, 300));

// ── UI ─────────────────────────────────────────────────────────────────────────
{
  // click: two crisp ticks with a soft low thump under them
  const out = seconds(0.12);
  mix(out, sine(1900, 0.03, 0.006), 0.5);
  mix(out, sine(1250, 0.04, 0.009), 0.45, 0.028);
  mix(out, sine(240, 0.08, 0.02), 0.5);
  normalize(out, 0.65);
  writeWav('click.wav', out);
}

{
  // whoosh: noise through a lowpass that opens and closes, airy not harsh
  const rand = mulberry32(42);
  const dur = 0.38;
  const n = noise(dur, rand);
  const swept = onePoleLP(n, (i) => {
    const t = i / SR / dur; // 0..1
    const bell = Math.sin(Math.PI * Math.min(t / 0.55, 1)) ** 2;
    return 300 + 2600 * bell;
  });
  const out = new Float64Array(swept);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR / dur;
    out[i] *= Math.sin(Math.PI * Math.min(t, 1)) ** 1.5;
  }
  normalize(out, 0.4);
  writeWav('whoosh.wav', out);
}

{
  // pop: tiny upward blip for list reveals
  const out = seconds(0.09);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 340 + 420 * (t / 0.09);
    out[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.02);
  }
  normalize(out, 0.5);
  writeWav('pop.wav', out);
}

{
  // chime: warm two-note rise (E5 → B5) with soft octave shimmer
  const out = seconds(0.7);
  mix(out, sine(659.3, 0.5, 0.14), 0.6);
  mix(out, sine(1318.5, 0.5, 0.1), 0.15);
  mix(out, sine(987.8, 0.55, 0.16), 0.7, 0.12);
  mix(out, sine(1975.5, 0.55, 0.1), 0.12, 0.12);
  normalize(out, 0.55);
  writeWav('chime.wav', out);
}

{
  // buzz: gentle low "not quite" — two close detuned lows, no harshness
  const out = seconds(0.28);
  mix(out, sine(146, 0.28, 0.09), 0.6);
  mix(out, sine(139, 0.28, 0.09), 0.6);
  const soft = onePoleLP(out, () => 500);
  soft.forEach((v, i) => (out[i] = v));
  envelopeExp(out, 0.11, 0.012);
  normalize(out, 0.45);
  writeWav('buzz.wav', out);
}

// ── extended palette (overhaul) ─────────────────────────────────────────────────
{
  // hover: barely-there high tick for cursor-over-target
  const out = seconds(0.05);
  mix(out, sine(2400, 0.03, 0.004), 0.4);
  mix(out, sine(3200, 0.02, 0.003), 0.2);
  normalize(out, 0.28);
  writeWav('hover.wav', out);
}

{
  // backspace: a duller, lower thock than a normal key — reads as "delete"
  const b = keySound(96, 300, 0.045, 0.14, 700);
  normalize(b, 0.5);
  writeWav('back.wav', b);
}

{
  // swish: quick bright transition sweep, shorter and airier than whoosh
  const rand = mulberry32(77);
  const dur = 0.26;
  const n = noise(dur, rand);
  const swept = onePoleLP(n, (i) => {
    const t = i / SR / dur;
    return 600 + 4200 * Math.sin(Math.PI * Math.min(t, 1)) ** 2;
  });
  const out = new Float64Array(swept);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR / dur;
    out[i] *= Math.sin(Math.PI * Math.min(t, 1)) ** 1.3;
  }
  normalize(out, 0.34);
  writeWav('swish.wav', out);
}

{
  // tick: tiny mechanical counter blip for count-ups / number reveals
  const out = seconds(0.04);
  mix(out, sine(1600, 0.02, 0.004), 0.5);
  mix(out, sine(880, 0.03, 0.006), 0.25);
  normalize(out, 0.4);
  writeWav('tick.wav', out);
}

{
  // send: confident upward "vip" + soft body — API submit / form send
  const out = seconds(0.22);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    const f = 420 + 520 * (t / 0.22);
    out[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.06) * 0.7;
  }
  mix(out, sine(180, 0.1, 0.03), 0.3);
  normalize(out, 0.5);
  writeWav('send.wav', out);
}

{
  // ting: single soft bell — "output landed", response received
  const out = seconds(0.5);
  mix(out, sine(1244.5, 0.42, 0.16), 0.6); // D#6
  mix(out, sine(2489, 0.4, 0.09), 0.12);
  normalize(out, 0.42);
  writeWav('ting.wav', out);
}

{
  // success: rising 3-note arpeggio fanfare (C6 E6 G6) — challenge passed
  const out = seconds(1.0);
  const notes = [1046.5, 1318.5, 1568, 2093];
  notes.forEach((f, k) => {
    mix(out, sine(f, 0.55, 0.2), 0.5, k * 0.09);
    mix(out, sine(f * 2, 0.5, 0.12), 0.1, k * 0.09);
  });
  normalize(out, 0.5);
  writeWav('success.wav', out);
}

{
  // bed: slow, soft evolving ambient pad — a warm underscore that ducks under the
  // voice. Long enough (18s) that looping is unobtrusive; deliberately quiet.
  const dur = 18;
  const out = seconds(dur);
  // a stack of detuned low sines forming a suspended chord, with slow LFO drift
  const roots = [65.41, 98.0, 130.81, 164.81, 196.0]; // C2 G2 C3 E3 G3
  const rand = mulberry32(909);
  for (const base of roots) {
    for (const det of [0.997, 1.0, 1.004]) {
      const f = base * det;
      const ph = rand() * Math.PI * 2;
      const lfoRate = 0.03 + rand() * 0.05;
      const lfoPh = rand() * Math.PI * 2;
      for (let i = 0; i < out.length; i++) {
        const t = i / SR;
        const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * lfoRate * t + lfoPh);
        out[i] += Math.sin(2 * Math.PI * f * t + ph) * lfo;
      }
    }
  }
  // soften: gentle lowpass + slow fade in/out at the seams for clean looping
  const soft = onePoleLP(out, () => 900);
  for (let i = 0; i < out.length; i++) out[i] = soft[i];
  const fade = Math.floor(1.5 * SR);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  normalize(out, 0.5);
  writeWav('bed.wav', out);
}

console.log('done.');

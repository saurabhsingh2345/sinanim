// Word timeline — the master clock for audio↔visual sync.
//
// Kokoro (via kokoro-js) doesn't expose per-token timings, but narration is
// synthesized ONE SENTENCE AT A TIME (lib/narration.ts), so sentence boundaries
// are measured ground truth: we know exactly how long each sentence's audio is
// and where it sits in the stitched clip. Within a sentence, word times are
// estimated by distributing the *voiced* span (leading/trailing silence trimmed
// off the actual samples) across the words, weighted by a syllable estimate,
// with pause weight after punctuation. In practice this lands within a few
// tens of ms — captions, typing pace and highlights can all key off it.
//
// Everything is in seconds relative to the start of the scene's stitched
// narration clip (== the scene's startTime on the paced timeline).

export interface WordTiming {
  word: string;
  /** Seconds from narration start when the word begins sounding. */
  start: number;
  /** Seconds from narration start when the word stops sounding. */
  end: number;
  /** Index of the sentence this word belongs to. */
  sentence: number;
}

/** A caption "page": a few words shown together, karaoke-highlighted. */
export interface CaptionPage {
  start: number;
  end: number;
  text: string;
  words: WordTiming[];
}

/** Rough spoken-length weight for one word (syllables + consonant padding). */
function wordWeight(raw: string): number {
  const word = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!word) return 0.6;
  const digits = (word.match(/[0-9]/g) || []).length;
  if (digits > 0) {
    // numbers are read out ("2024" → "twenty twenty-four")
    return 1.6 + digits * 1.1;
  }
  const groups = word.match(/[aeiouy]+/g);
  let syl = groups ? groups.length : 1;
  if (syl > 1 && /[^aeiouy]e$/.test(word)) syl -= 1; // silent e
  return Math.max(1, syl) + 0.35;
}

/** Extra pause weight after a word, from its trailing punctuation. */
function pauseWeight(raw: string): number {
  if (/[.!?…]["')\]]*$/.test(raw)) return 0.9;
  if (/[—–]["')\]]*$/.test(raw)) return 0.6;
  if (/[,;:]["')\]]*$/.test(raw)) return 0.45;
  return 0;
}

/** First/last voiced sample (seconds) — trims TTS lead-in/tail silence. */
export function voicedSpan(
  samples: Float32Array,
  sampleRate: number,
  threshold = 0.012,
): { start: number; end: number } {
  let a = 0;
  let b = samples.length - 1;
  while (a < samples.length && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b]) < threshold) b--;
  if (a >= b) return { start: 0, end: samples.length / sampleRate };
  return { start: a / sampleRate, end: (b + 1) / sampleRate };
}

/** Distribute one sentence's words across its voiced audio span. */
export function sentenceWordTimings(
  text: string,
  spanStart: number,
  spanEnd: number,
  sentence: number,
): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weights = words.map(wordWeight);
  const pauses = words.map(pauseWeight);
  pauses[pauses.length - 1] = 0; // trailing pause is outside the voiced span
  const total = weights.reduce((a, w, i) => a + w + pauses[i], 0);
  const unit = Math.max(spanEnd - spanStart, 0.05) / Math.max(total, 0.001);

  const out: WordTiming[] = [];
  let t = spanStart;
  words.forEach((w, i) => {
    const dur = weights[i] * unit;
    out.push({ word: w, start: t, end: t + dur, sentence });
    t += dur + pauses[i] * unit;
  });
  return out;
}

export interface SentenceClipInfo {
  text: string;
  /** Offset of this sentence clip inside the stitched scene clip (s). */
  offset: number;
  /** Raw samples of just this sentence (for silence trimming). */
  samples: Float32Array;
  sampleRate: number;
}

/** Word timeline for a whole scene from its per-sentence clips. */
export function buildWordTimeline(sentences: SentenceClipInfo[]): WordTiming[] {
  const out: WordTiming[] = [];
  sentences.forEach((s, i) => {
    const span = voicedSpan(s.samples, s.sampleRate);
    out.push(
      ...sentenceWordTimings(s.text, s.offset + span.start, s.offset + span.end, i),
    );
  });
  return out;
}

/** Index of the word sounding at `t` (or -1 before the first word).
 *  Between words, returns the previous word (it "holds" until the next). */
export function wordIndexAt(words: WordTiming[], t: number): number {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** First word whose text contains `needle` (case/punct-insensitive) — used to
 *  resolve DSL sync anchors like "word:closure". */
export function findAnchorWord(words: WordTiming[], needle: string): WordTiming | null {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = clean(needle);
  if (!n) return null;
  for (const w of words) {
    if (clean(w.word).includes(n)) return w;
  }
  return null;
}

/** Group words into karaoke caption pages. Pages break on a character budget,
 *  at sentence ends, and at audible pauses, so no page lingers stale. */
export function buildCaptionPages(words: WordTiming[], maxChars = 42): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let cur: WordTiming[] = [];
  let chars = 0;

  const flush = () => {
    if (!cur.length) return;
    pages.push({
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text: cur.map((w) => w.word).join(' '),
      words: cur,
    });
    cur = [];
    chars = 0;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = chars ? chars + 1 + w.word.length : w.word.length;
    if (cur.length && next > maxChars) flush();
    cur.push(w);
    chars = chars ? chars + 1 + w.word.length : w.word.length;

    const sentenceEnd = /[.!?…]["')\]]*$/.test(w.word);
    const bigGap = i + 1 < words.length && words[i + 1].start - w.end > 0.55;
    if (sentenceEnd || bigGap) flush();
  }
  flush();

  // a page holds until the next page starts (no flicker between words)
  for (let i = 0; i < pages.length - 1; i++) pages[i].end = pages[i + 1].start;
  return pages;
}

/** Fallback pages when there's no synthesized audio (voice off / no timings):
 *  spread the narration text evenly across [0, duration]. */
export function estimatedCaptionPages(text: string, duration: number, maxChars = 42): CaptionPage[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || duration <= 0) return [];
  const weights = words.map(wordWeight);
  const pauses = words.map(pauseWeight);
  const total = weights.reduce((a, w, i) => a + w + pauses[i], 0);
  const unit = duration / Math.max(total, 0.001);
  const timed: WordTiming[] = [];
  let t = 0;
  words.forEach((w, i) => {
    const dur = weights[i] * unit;
    timed.push({ word: w, start: t, end: t + dur, sentence: 0 });
    t += dur + pauses[i] * unit;
  });
  return buildCaptionPages(timed, maxChars);
}

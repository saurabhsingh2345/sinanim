// Caption file export — .srt / .vtt built from the same word timeline that
// drives the burned-in karaoke captions, so uploaded subtitles match the
// video frame-for-frame. When a scene has no synthesized timings (voice off),
// cues fall back to an estimated spread across the scene's speech window.

import { AnimationDSL } from './types';
import {
  WordTiming,
  buildCaptionPages,
  estimatedCaptionPages,
} from './word-timeline';
import { spokenNarration } from './step-sync';

export interface CaptionCue {
  /** Absolute video time (s). */
  start: number;
  end: number;
  text: string;
}

/** One cue per caption page, in absolute video time. */
export function buildCaptionCues(
  dsl: AnimationDSL,
  words?: Map<number, WordTiming[]>,
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  dsl.scenes.forEach((s, i) => {
    const spoken = spokenNarration(s);
    if (!spoken) return;
    const speech = Math.min(s.narrationDuration ?? s.duration, s.duration);
    const timed = words?.get(i);
    const pages =
      timed && timed.length
        ? buildCaptionPages(timed)
        : estimatedCaptionPages(spoken, speech);
    for (const p of pages) {
      cues.push({
        start: s.startTime + p.start,
        end: Math.min(s.startTime + p.end, s.startTime + s.duration),
        text: p.text,
      });
    }
  });
  // clamp overlaps (scene speech windows can butt against the next scene)
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start;
  }
  return cues.filter((c) => c.end - c.start > 0.05);
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function stamp(t: number, msSep: ',' | '.'): string {
  const ms = Math.round((t % 1) * 1000);
  const s = Math.floor(t) % 60;
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}${msSep}${pad(ms, 3)}`;
}

export function cuesToSRT(cues: CaptionCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
    .join('\n');
}

export function cuesToVTT(cues: CaptionCue[]): string {
  const body = cues
    .map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function downloadCaptions(
  dsl: AnimationDSL,
  words: Map<number, WordTiming[]> | undefined,
  format: 'srt' | 'vtt',
  filename: string,
) {
  const cues = buildCaptionCues(dsl, words);
  const text = format === 'srt' ? cuesToSRT(cues) : cuesToVTT(cues);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

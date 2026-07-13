// Music-bed ducking. A soft ambient pad (public/sounds/bed.wav) plays under the
// whole lesson at a low level, and automatically ducks ~10 dB whenever narration
// is speaking (classic radio sidechain) so the voice always sits on top. Pure
// data in → gain automation out, shared by the offline mix and the live engine.

export interface VoiceInterval {
  start: number;
  end: number;
}

export interface SfxLike {
  kind: 'sfx' | 'voice';
  at: number;
  offset?: number;
  stopAt?: number;
  buffer: { duration: number };
}

/** Collapse voice events into merged [start,end] speaking intervals. */
export function voiceIntervals(events: SfxLike[]): VoiceInterval[] {
  const raw: VoiceInterval[] = [];
  for (const e of events) {
    if (e.kind !== 'voice') continue;
    const start = e.at;
    const dur = Math.max(0, e.buffer.duration - (e.offset ?? 0));
    const end = e.stopAt != null ? Math.min(e.stopAt, start + dur) : start + dur;
    if (end > start) raw.push({ start, end });
  }
  raw.sort((a, b) => a.start - b.start);
  const merged: VoiceInterval[] = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end + 0.25) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }
  return merged;
}

export interface BedDuckOpts {
  /** bed level when no one is speaking (linear gain) */
  base?: number;
  /** bed level while speaking (linear gain) */
  ducked?: number;
  /** ramp time into/out of a duck (seconds) */
  ramp?: number;
}

/**
 * Schedule a ducking envelope on `gain` (a Web Audio GainNode param or the
 * OfflineAudioContext equivalent) across the given voice intervals.
 */
export function scheduleBedDuck(
  gain: { setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void },
  intervals: VoiceInterval[],
  duration: number,
  opts: BedDuckOpts = {},
) {
  const base = opts.base ?? 0.14;
  const ducked = opts.ducked ?? 0.05;
  const ramp = opts.ramp ?? 0.35;
  gain.setValueAtTime(base, 0);
  for (const iv of intervals) {
    const dStart = Math.max(0, iv.start - ramp * 0.5);
    gain.setValueAtTime(base, Math.max(0, dStart - 0.001));
    gain.linearRampToValueAtTime(ducked, iv.start + ramp * 0.5);
    gain.setValueAtTime(ducked, Math.max(iv.start + ramp * 0.5, iv.end - ramp));
    gain.linearRampToValueAtTime(base, Math.min(duration, iv.end + ramp));
  }
}

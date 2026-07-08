import { SoundEngine } from './sounds';
import { Prepared, bulletRevealTimes, diagramNodeTimes, quizRevealAt } from './renderer';
import { revealedCount } from './timing';

/**
 * Drives sound from the timeline. `tick(prep, time)` runs every rendered frame
 * (preview and export) and plays: a click on Run; a keystroke sample per typed
 * character — from the SAME per-character schedule as the renderer, and passing
 * the character so enter/space get their own voice; a whoosh when chapter/title
 * cards land; a pop for each bullet/diagram-node reveal; the quiz reveal chime
 * (export only — the interactive overlay owns quiz feedback); and the narration
 * voice clip for whichever scene's speech window contains `time`.
 * `reset()` on every seek so nothing double-fires.
 */
export class Conductor {
  private last = -1;
  private firedClicks = new Set<number>();
  private firedCues = new Set<string>();
  private lastKeyAt = -1;
  private narrationPlaying = -1; // scene index of the clip currently sounding
  private narration = new Map<number, AudioBuffer>();
  /** Playback speed multiplier (narration follows the master clock). */
  rate = 1;
  /** Set true in the live player: quizzes are answered, not auto-revealed. */
  interactive = false;

  constructor(private engine: SoundEngine) {}

  /** sceneIndex -> synthesized speech (from lib/narration.ts). */
  setNarration(buffers: Map<number, AudioBuffer>) {
    this.narration = buffers;
  }

  reset(time = 0) {
    this.last = time;
    this.firedClicks.clear();
    this.firedCues.clear();
    this.lastKeyAt = -1;
    this.narrationPlaying = -1;
    this.engine.stopNarration();
  }

  private cue(id: string, crossed: boolean, fire: () => void) {
    if (!crossed || this.firedCues.has(id)) return;
    this.firedCues.add(id);
    fire();
  }

  tick(prep: Prepared, time: number) {
    const prev = this.last;
    this.last = time;
    if (prev < 0 || time < prev) return; // fresh start or seek backward

    let typedChar: string | undefined;
    prep.dsl.scenes.forEach((s, i) => {
      if (s.type === 'click') {
        if (time >= s.startTime && prev < s.startTime && !this.firedClicks.has(i)) {
          this.firedClicks.add(i);
          if ((s as any).sound !== false) this.engine.click();
        }
      } else if (s.type === 'code' || s.type === 'terminal' || s.type === 'diff') {
        const sched = prep.schedule.get(i);
        if (!sched) return;
        const now = revealedCount(sched, time - s.startTime);
        const was = revealedCount(sched, prev - s.startTime);
        if (now > was) {
          typedChar = prep.typedText.get(i)?.[now - 1];
          if (typedChar === undefined) typedChar = '';
        }
      } else if (s.type === 'chapter' || s.type === 'title') {
        this.cue(`card:${i}`, time >= s.startTime && prev < s.startTime && s.startTime > 0.2, () =>
          this.engine.whoosh(),
        );
      } else if (s.type === 'bullets') {
        bulletRevealTimes(s).forEach((at, bi) => {
          const t = s.startTime + at;
          this.cue(`bullet:${i}:${bi}`, time >= t && prev < t, () => this.engine.pop());
        });
      } else if (s.type === 'diagram') {
        diagramNodeTimes(s).forEach((at, ni) => {
          const t = s.startTime + at;
          this.cue(`node:${i}:${ni}`, time >= t && prev < t, () => this.engine.pop());
        });
      } else if (s.type === 'quiz' && !this.interactive) {
        const t = s.startTime + quizRevealAt(s);
        this.cue(`quiz:${i}`, time >= t && prev < t, () => this.engine.chime());
      }
    });

    if (typedChar !== undefined && time - this.lastKeyAt > 0.03) {
      this.lastKeyAt = time;
      this.engine.keystroke(typedChar);
    }

    this.tickNarration(prep, time);
  }

  private tickNarration(prep: Prepared, time: number) {
    // the narrated scene whose speech window covers `time`
    let idx = -1;
    let start = -1;
    prep.dsl.scenes.forEach((s, i) => {
      const buf = this.narration.get(i);
      if (!buf) return;
      // timeline seconds equal speech content seconds; `rate` only scales wall time
      if (time >= s.startTime && time < s.startTime + buf.duration && s.startTime >= start) {
        idx = i;
        start = s.startTime;
      }
    });

    if (idx === this.narrationPlaying) return;
    if (idx === -1) {
      // let a clip ring out past its scene only if nothing else claimed the voice
      return;
    }
    const buf = this.narration.get(idx)!;
    this.engine.playNarration(buf, time - start, this.rate);
    this.narrationPlaying = idx;
  }
}

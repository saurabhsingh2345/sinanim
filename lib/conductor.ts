import { SoundEngine } from './sounds';
import { Prepared } from './renderer';
import { revealedCount } from './timing';

/**
 * Drives sound from the timeline. `tick(prep, time)` runs every rendered frame
 * (preview and export) and plays a click on Run and a keystroke sample for each
 * character as it is typed — using the SAME per-character schedule as the renderer
 * so key clicks land exactly on each letter (including the per-line pauses).
 * `reset()` on every seek so nothing double-fires.
 */
export class Conductor {
  private last = -1;
  private firedClicks = new Set<number>();
  private lastKeyAt = -1;

  constructor(private engine: SoundEngine) {}

  reset(time = 0) {
    this.last = time;
    this.firedClicks.clear();
    this.lastKeyAt = -1;
  }

  tick(prep: Prepared, time: number) {
    const prev = this.last;
    this.last = time;
    if (prev < 0 || time < prev) return; // fresh start or seek backward

    let typed = false;
    prep.dsl.scenes.forEach((s, i) => {
      if (s.type === 'click') {
        if (time >= s.startTime && prev < s.startTime && !this.firedClicks.has(i)) {
          this.firedClicks.add(i);
          if ((s as any).sound !== false) this.engine.click();
        }
      } else if (s.type === 'code' || s.type === 'terminal') {
        const sched = prep.schedule.get(i);
        if (!sched) return;
        const now = revealedCount(sched, time - s.startTime);
        const was = revealedCount(sched, prev - s.startTime);
        if (now > was) typed = true;
      }
    });

    if (typed && time - this.lastKeyAt > 0.03) {
      this.lastKeyAt = time;
      this.engine.keystroke();
    }
  }
}

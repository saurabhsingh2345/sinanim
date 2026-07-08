// Headless check that key sounds line up with characters and go silent during
// the per-line pause. Uses a mock SoundEngine that records fire timestamps.
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare } from '../lib/renderer';
import { Conductor } from '../lib/conductor';
import { typeSchedule } from '../lib/timing';

const dsl = repace(
  normalizeDSL({
    title: 'hello',
    scenes: [
      { type: 'code', language: 'python', code: "def hello():\n    print('Hi')", typingSpeed: 14, startTime: 0, duration: 5 },
      { type: 'click', button: 'Run', startTime: 6, duration: 0.5 },
      { type: 'terminal', output: 'Hi', typingSpeed: 34, startTime: 7, duration: 2 },
    ],
  }),
);
const prep = await prepare(dsl);

const fires: { t: number; type: string }[] = [];
let cur = 0;
const mock = {
  keystroke: () => fires.push({ t: cur, type: 'key' }),
  click: () => fires.push({ t: cur, type: 'click' }),
};
const cond = new Conductor(mock as any);
cond.reset(0);

const fps = 30;
for (cur = 0; cur <= dsl.duration + 0.1; cur += 1 / fps) cond.tick(prep, cur);

const code = dsl.scenes[0] as any;
const sched = typeSchedule(code.code, code.typingSpeed);
console.log('code:', JSON.stringify(code.code), 'speed', code.typingSpeed.toFixed(1));
console.log('chars to type:', code.code.replace(/\n/g, '').length, '(excluding newlines)');
const keyFires = fires.filter((f) => f.type === 'key');
console.log('key sounds fired:', keyFires.length);
console.log('clicks fired:', fires.filter((f) => f.type === 'click').length);

// find the newline pause window in the code scene
const nlIndex = code.code.indexOf('\n');
const pauseStart = sched[nlIndex];
const pauseEnd = sched[nlIndex + 1];
console.log(`line-1 pause window: ${pauseStart.toFixed(2)}s .. ${pauseEnd.toFixed(2)}s (should have NO key sounds)`);
const inPause = keyFires.filter((f) => f.t > pauseStart + 0.02 && f.t < pauseEnd - 0.02);
console.log('key sounds during pause:', inPause.length, inPause.length === 0 ? 'OK ✓' : 'BAD ✗');

// gaps between consecutive key sounds — machine-gun would be ~0.03s constant
const gaps = keyFires.slice(1).map((f, i) => +(f.t - keyFires[i].t).toFixed(3));
console.log('inter-key gaps (s):', gaps.join(' '));

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'Challenge card',
  scenes: [
    {
      type: 'challenge', language: 'python',
      prompt: 'Write a function is_prime(n) that returns True when n is a prime number.',
      starterCode: 'def is_prime(n):\n    # your code here\n    pass',
      solution: 'def is_prime(n):\n    if n < 2:\n        return False\n    for i in range(2, int(n**0.5)+1):\n        if n % i == 0:\n            return False\n    return True',
      tests: [{ expression: 'is_prime(7)', expected: 'True' }, { expression: 'is_prime(8)', expected: 'False' }],
      hint: 'A prime has no divisors between 2 and its square root.',
      concept: 'primes',
      startTime: 0, duration: 12, narration: 'Now it is your turn to write this one.',
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

// export view (prompt) and the reveal view (solution)
for (const [name, t] of [['challenge-prompt', 1.0], ['challenge-reveal', 6.5]] as const) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t + 's');
}

// Stress-test overflow fixes: a long prompt + long code lines (challenge card),
// and diagram nodes with colliding / off-frame coordinates.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'Overflow check',
  scenes: [
    {
      type: 'challenge',
      language: 'python',
      prompt: 'Write a function that takes a list of transactions, groups them by category, sums the amounts within each category, and returns the three categories with the highest total spending sorted in descending order.',
      starterCode:
        'def top_categories(transactions):\n    # transactions is a list of dicts: {"category": str, "amount": float}\n    # 1. accumulate totals per category using a dictionary comprehension or defaultdict\n    totals = {}\n    for t in transactions:\n        totals[t["category"]] = totals.get(t["category"], 0) + t["amount"]\n    # 2. sort the categories by their accumulated total in descending order and slice\n    return sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:3]',
      solution: 'from collections import defaultdict\n\ndef top_categories(transactions):\n    totals = defaultdict(float)\n    for t in transactions:\n        totals[t["category"]] += t["amount"]\n    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)\n    return ranked[:3]',
      tests: [{ input: '[]', expected: '[]' }, { input: '[{"category":"food","amount":5}]', expected: '[("food",5)]' }],
      startTime: 0, duration: 12,
    },
    {
      type: 'diagram',
      title: 'Request flow',
      nodes: [
        { id: 'a', label: 'Browser', x: 0.5, y: 0.5 },
        { id: 'b', label: 'Load Balancer', x: 0.52, y: 0.52 },  // overlaps a
        { id: 'c', label: 'API Server', x: 0.5, y: 0.5 },        // overlaps a
        { id: 'd', label: 'PostgreSQL Database', x: 0.98, y: 0.98 }, // off-frame
        { id: 'e', label: 'Redis Cache', x: 0.02, y: 0.02 },     // off-frame
      ],
      edges: [
        { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'c', to: 'e' },
      ],
      startTime: 0, duration: 10,
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const ch = dsl.scenes[0], dg = dsl.scenes[1];
const shots: [string, number][] = [
  ['of-challenge-start', ch.startTime + ch.duration * 0.25],
  ['of-challenge-reveal', ch.startTime + ch.duration * 0.85],
  ['of-diagram', dg.startTime + dg.duration * 0.95],
];
for (const [name, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}

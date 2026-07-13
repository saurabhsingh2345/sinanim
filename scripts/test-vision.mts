// Smoke test the vision-QA render+critique against the real VLM.
//   npx tsx scripts/test-vision.mts
import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
import { normalizeDSL, repace } from '../lib/dsl';
import { visionQA } from '../lib/authoring/vision-qa';
import { TEMPLATES } from '../lib/scaffolds';

// 1) a clean scaffold — should return few/no defects
const clean = repace(normalizeDSL(TEMPLATES.find((t) => t.id === 'diagram')!.build()));
console.log('critiquing CLEAN (diagram)...');
console.log(' notes:', JSON.stringify(await visionQA(clean)));

// 2) a deliberately-broken lesson: a bullets card stuffed past the frame
const broken = normalizeDSL({
  title: 'Broken', fps: 30, width: 1920, height: 1080, backgroundColor: '#0b0b10',
  scenes: [{
    type: 'bullets', title: 'This title is intentionally an extremely long run-on heading that should overflow the frame width and get clipped at the panel edge no matter what',
    items: Array.from({ length: 9 }, (_, i) => `Bullet number ${i + 1} with a very long sentence that keeps going and going so that nine of them cannot possibly fit vertically in one frame`),
    startTime: 0, duration: 6,
  }],
} as any);
console.log('\ncritiquing BROKEN (9 overstuffed bullets)...');
console.log(' notes:', JSON.stringify(await visionQA(repace(broken)), null, 2));

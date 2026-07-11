// One-off: generate a lesson with the new cinematic prompts and report its shape.
import { generateDSL } from '../lib/llm';
import { writeFileSync } from 'node:fs';

const dsl = await generateDSL('Teach Python list comprehensions to a beginner who already knows for loops');
writeFileSync('/tmp/gen-lesson.json', JSON.stringify(dsl, null, 2));

const words = (s?: string) => (s ? s.trim().split(/\s+/).length : 0);
let total = 0;
for (const s of dsl.scenes) {
  total += words(s.narration);
  if (s.type === 'ide') {
    const st = s.steps.map((x: any, i: number) => `    ${i}. ${x.action.kind}${x.action.kind==='explain' && x.action.terminal ? '(terminal)' : ''} — ${words(x.narration)}w`);
    console.log(`ide scene: ${s.steps.length} steps`);
    console.log(st.join('\n'));
    total += s.steps.reduce((a: number, x: any) => a + words(x.narration), 0);
  }
}
console.log('scene types:', dsl.scenes.map((s) => s.type).join(', '));
console.log('total spoken words (approx):', total);

// End-to-end: generate the real lesson the user reported, inspect its shape,
// AND render sample frames so we can eyeball rendering issues (overflow, camera,
// typing). Loads .env.local like Next.js does (tsx doesn't auto-load it).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const { generateDSL } = await import('../lib/llm');
const { runVisualQA } = await import('../lib/qa');
const { repace } = await import('../lib/dsl');
const { prepare, renderFrame } = await import('../lib/renderer');

const prompt = 'Python f-strings Tutorial';
console.log('provider:', process.env.LLM_PROVIDER, 'model:', process.env.LLM_MODEL);
let dsl: any = await generateDSL(prompt, {});
writeFileSync('/tmp/fstrings-dsl.json', JSON.stringify(dsl, null, 2));

console.log('\n=== SCENES ===');
dsl.scenes.forEach((s: any, i: number) => {
  const extra = s.type === 'ide' ? ` steps=${s.steps.length} [${s.steps.map((st: any) => st.action.kind).join(',')}]` : '';
  console.log(`${i + 1}. ${s.type}${extra} @${s.startTime?.toFixed?.(1)}s+${s.duration?.toFixed?.(1)}s`);
});
console.log('terminals=', dsl.scenes.filter((s: any) => s.type === 'terminal').length,
            'cli=', dsl.scenes.filter((s: any) => s.type === 'cli').length,
            'ide=', dsl.scenes.filter((s: any) => s.type === 'ide').length);
// Narration duplication guard: every step narration should appear EXACTLY once
// in the scene's spoken text (the round-tripping bug made them repeat 2-4x).
const { spokenNarration } = await import('../lib/step-sync');
console.log('\n=== NARRATION DEDUP ===');
for (const s of dsl.scenes as any[]) {
  const spoken = spokenNarration(s);
  const sents = spoken.split(/(?<=[.!?])\s+/).map((x: string) => x.trim()).filter((x: string) => x.length > 12);
  const counts: Record<string, number> = {};
  for (const x of sents) counts[x] = (counts[x] || 0) + 1;
  const dups = Object.entries(counts).filter(([, v]) => v > 1);
  const words = spoken.split(/\s+/).filter(Boolean).length;
  console.log(`${s.type}: ${words}w, ${sents.length} sentences, ${dups.length} duplicated`);
  dups.slice(0, 3).forEach(([k, v]) => console.log(`   ${v}x: ${k.slice(0, 60)}`));
}

console.log('\n=== QA ===');
for (const n of runVisualQA(dsl, prompt)) console.log(' -', n);

// Render a frame in the middle of every scene to eyeball each surface.
dsl = repace(dsl);
const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
console.log('\n=== FRAMES ===');
dsl.scenes.forEach((s: any, i: number) => {
  const t = s.startTime + s.duration * 0.55;
  renderFrame(ctx, prep, t);
  const name = `gen-${String(i + 1).padStart(2, '0')}-${s.type}`;
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
});
// Extra: an early frame of the ide scene while typing (line-advance check).
const ide = dsl.scenes.find((s: any) => s.type === 'ide');
if (ide) {
  for (const [tag, frac] of [['type-a', 0.12], ['type-b', 0.3]] as const) {
    const t = ide.startTime + ide.duration * frac;
    renderFrame(ctx, prep, t);
    writeFileSync(`scripts/frame-gen-ide-${tag}.png`, canvas.toBuffer('image/png'));
    console.log('wrote ide', tag, '@', t.toFixed(1) + 's');
  }
}

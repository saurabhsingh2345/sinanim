import { AnimationDSL, PRIMARY_CARD_TYPES } from './types';
import { lintScript } from './script-lint';
import { spokenNarration } from './step-sync';

/** ~2.6 words/second is a comfortable tutorial speaking rate (Kokoro default). */
const WORDS_PER_SECOND = 2.6;

/**
 * Lightweight visual QA (Chalkboard-inspired): structural checks on the DSL
 * before / after generation. Returns human-readable notes; empty = looks good.
 */
export function runVisualQA(dsl: AnimationDSL, topicHint?: string): string[] {
  const notes: string[] = [];
  const topic = (topicHint || dsl.title || '').toLowerCase();

  if (!dsl.scenes.length) {
    notes.push('No scenes — add at least a title and one teaching beat.');
    return notes;
  }

  const primaries = dsl.scenes.filter((s) => PRIMARY_CARD_TYPES.has(s.type));
  if (primaries.length < 2) {
    notes.push('Lesson is thin — aim for 3+ primary scenes (title → teach → recap).');
  }

  const hasRun =
    dsl.scenes.some((s) => s.type === 'ide' && s.steps.some((st) => st.action.kind === 'run')) ||
    dsl.scenes.some((s) => s.type === 'terminal');
  if (!hasRun && dsl.scenes.some((s) => s.type === 'ide' || s.type === 'code')) {
    notes.push('No run step — add an IDE "run" (or terminal) so learners see real output.');
  }

  if (!dsl.scenes.some((s) => s.type === 'quiz')) {
    notes.push('No quiz — add a checkpoint after the key concept.');
  }

  // Terminal soup: terminals show output only (no code), so a lesson built from
  // them explains nothing. Coding lessons must teach in an "ide" scene.
  const terminals = dsl.scenes.filter((s) => s.type === 'terminal').length;
  const ides = dsl.scenes.filter((s) => s.type === 'ide').length;
  if (terminals >= 2 || (terminals >= 1 && ides === 0 && !dsl.scenes.some((s) => s.type === 'code'))) {
    notes.push(
      `${terminals} bare "terminal" scene(s) but no code walkthrough — a terminal shows output, not code, so it can't teach. Move the code into an "ide" scene (type → explain → run) and keep at most one terminal.`,
    );
  }

  if (
    /\b(python|javascript|typescript|loop|function|algorithm|coding)\b/.test(topic) &&
    !dsl.scenes.some((s) => s.type === 'challenge')
  ) {
    notes.push('Coding topic missing challenge — add a hands-on beat with tests.');
  }

  // a recap bullets/quote anywhere in the last three primaries counts — the
  // structure intentionally puts the hands-on challenge after the recap
  const tail = primaries.slice(-3);
  if (tail.length && !tail.some((p) => p.type === 'bullets' || p.type === 'quote')) {
    notes.push('No closing recap — end with a bullets scene summarizing takeaways.');
  }

  if (/\b(loop|for\s+loop|while|algorithm|sort|pointer|recurs)/.test(topic) && !dsl.scenes.some((s) => s.type === 'viz')) {
    notes.push('Loops/algorithm topic missing viz — animate the idea with array/vars steps.');
  }

  for (let i = 0; i < dsl.scenes.length; i++) {
    const s = dsl.scenes[i];
    const label = `Scene ${i + 1} (${s.type})`;
    const words = spokenNarration(s).trim().split(/\s+/).filter(Boolean).length;

    if (PRIMARY_CARD_TYPES.has(s.type) && words < 16) {
      notes.push(`${label}: narration is short — aim for 2+ spoken sentences (~30 words).`);
    }

    if (s.type === 'ide') {
      if (!s.files.length) notes.push(`${label}: IDE has no files — add a file tree.`);
      if (!s.steps.length) notes.push(`${label}: IDE has no steps — nothing will animate.`);
      const emptyTypes = s.steps.filter((st) => st.action.kind === 'type' && !st.action.code.trim());
      if (emptyTypes.length) notes.push(`${label}: ${emptyTypes.length} type step(s) have empty code.`);
    }

    if (s.type === 'browser') {
      if (!s.blocks.length) notes.push(`${label}: browser page has no blocks.`);
      if (!s.url) notes.push(`${label}: missing URL.`);
    }

    if (s.type === 'cli' && !s.commands.length) {
      notes.push(`${label}: terminal has no commands.`);
    }

    if (s.type === 'layout') {
      if (s.regions.length < 2 && s.preset !== 'ide-only') {
        notes.push(`${label}: layout should have 2 regions for side-by-side teaching.`);
      }
    }

    if (s.type === 'quiz') {
      if (s.options.length < 2) notes.push(`${label}: quiz needs at least 2 options.`);
      if (s.answerIndex < 0 || s.answerIndex >= s.options.length) {
        notes.push(`${label}: answerIndex is out of range.`);
      }
    }

    if (s.type === 'challenge') {
      if (!s.tests?.length) notes.push(`${label}: challenge has no tests.`);
      if (!s.solution?.trim()) notes.push(`${label}: challenge missing solution.`);
    }
  }

  // ── Pacing audit: voice and visuals must carry comparable weight ──
  for (let i = 0; i < dsl.scenes.length; i++) {
    const s = dsl.scenes[i];
    const words = spokenNarration(s).trim().split(/\s+/).filter(Boolean).length;
    const speech = words / WORDS_PER_SECOND;
    // lots of on-screen content but almost no voice = the "silent typing" feel
    const contentChars =
      s.type === 'code' ? s.code.length
      : s.type === 'diff' ? s.after.length
      : s.type === 'ide' ? s.steps.reduce((a, st) => a + (st.action.kind === 'type' ? st.action.code.length : 40), 0)
      : 0;
    if (contentChars > 300 && speech < 6) {
      notes.push(
        `Scene ${i + 1} (${s.type}): heavy code with thin narration (~${Math.round(speech)}s of voice) — the visuals will outrun the voice; narrate the reasoning line by line.`,
      );
    }
    // six-minute rule: any single scene monologue over ~45s loses people.
    // Step-narrated ide scenes are exempt — their steps re-cut the beat every
    // few sentences, so a long scene is a sequence, not a monologue.
    const stepNarrated = s.type === 'ide' && s.steps.some((st) => st.narration && st.narration.trim());
    if (speech > 45 && !stepNarrated) {
      notes.push(
        `Scene ${i + 1} (${s.type}): ~${Math.round(speech)}s of continuous narration — split this beat in two.`,
      );
    }
    // the mandatory ide teaching rhythm: no two writes in a row, and every
    // run gets its output read back
    if (s.type === 'ide' && s.steps.length) {
      const kinds = s.steps.map((st) => st.action.kind);
      for (let j = 1; j < kinds.length; j++) {
        if (kinds[j] === 'type' && kinds[j - 1] === 'type') {
          notes.push(
            `Scene ${i + 1} (ide): steps ${j} and ${j + 1} are back-to-back "type" actions — insert an "explain" step (glow the lines just typed, teach them) between writes.`,
          );
          break;
        }
      }
      const lastRun = kinds.lastIndexOf('run');
      if (lastRun >= 0 && !kinds.slice(lastRun + 1).some((k) => k === 'explain' || k === 'highlight')) {
        notes.push(
          `Scene ${i + 1} (ide): the run at step ${lastRun + 1} is never explained — add an "explain" step with "terminal": true that reads the output back and says what it MEANS.`,
        );
      }
      const missing = s.steps.filter((st) => !(st.narration && st.narration.trim())).length;
      if (missing > 0 && missing < s.steps.length) {
        notes.push(
          `Scene ${i + 1} (ide): ${missing} step(s) have no "narration" — every step needs 2-4 spoken sentences of its own.`,
        );
      }
    }
  }
  const totalWords = dsl.scenes.reduce(
    (a, s) => a + spokenNarration(s).split(/\s+/).filter(Boolean).length, 0,
  );
  if (totalWords / WORDS_PER_SECOND > 6.5 * 60) {
    notes.push('Lesson runs past ~6 minutes of speech — engagement drops hard after 6; split into two lessons.');
  }

  // ── Script lint: AI-slop phrases / robotic rhythm / spoken symbols ──
  for (const issue of lintScript(dsl).slice(0, 6)) {
    notes.push(`Scene ${issue.sceneIndex + 1} narration: ${issue.message}`);
  }

  const themes = new Set(
    dsl.scenes.map((s) => (typeof s.theme === 'string' ? s.theme : null)).filter(Boolean),
  );
  if (themes.size > 4) {
    notes.push('Many different scene themes — consider a single brand kit for cohesion.');
  }

  if (!dsl.theme && !dsl.brand?.accent) {
    notes.push('No lesson theme or brand accent set — pick a ThemePack for a consistent feel.');
  }

  if (!notes.length) notes.push('QA passed — structure looks solid. Preview a few frames before export.');
  return notes;
}

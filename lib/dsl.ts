import { AnimationDSL, AnimProp, Easing, Keyframe, Scene } from './types';
import { clamp } from './utils';
import { typeDuration } from './timing';
import { diffLines } from './diff';
import { morphTiming } from './morph';

const MASCOT_ACTIONS = ['wave', 'point', 'think', 'celebrate', 'shocked', 'idle'];

const ANIM_PROPS: AnimProp[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];
const EASINGS: Easing[] = ['linear', 'easeInOut', 'easeInCubic', 'easeOutCubic', 'easeOutBack'];

function normKeyframe(k: any): Keyframe | null {
  if (!k || !ANIM_PROPS.includes(k.prop)) return null;
  return {
    prop: k.prop,
    from: Number(k.from) || 0,
    to: Number(k.to) || 0,
    start: Math.max(0, Number(k.start) || 0),
    duration: Math.max(0.01, Number(k.duration) || 0.5),
    easing: EASINGS.includes(k.easing) ? k.easing : 'easeInOut',
  };
}

const DEFAULTS = {
  fps: 30,
  width: 1920,
  height: 1080,
  backgroundColor: '#0b0b10',
};

/**
 * Turn possibly-messy model output into a well-formed DSL the renderer can trust.
 * - fills missing startTime for sequential scenes (e.g. `wait`)
 * - clamps typing speeds / fps to sane ranges
 * - recomputes the true video duration from the scenes
 */
export function normalizeDSL(raw: any): AnimationDSL {
  if (!raw || typeof raw !== 'object') {
    throw new Error('DSL is not an object');
  }
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    throw new Error('DSL has no scenes');
  }

  const fps = clamp(Number(raw.fps) || DEFAULTS.fps, 24, 60);
  let cursor = 0;

  const scenes: Scene[] = raw.scenes.map((s: any): Scene => {
    const duration = clamp(Number(s.duration) || 1, 0.2, 60);
    const startTime =
      typeof s.startTime === 'number' && isFinite(s.startTime)
        ? Math.max(0, s.startTime)
        : cursor;
    cursor = startTime + duration;

    const base = {
      startTime,
      duration,
      narration:
        typeof s.narration === 'string' && s.narration.trim()
          ? s.narration.trim()
          : undefined,
    };

    switch (s.type) {
      case 'code':
        return {
          type: 'code',
          language: String(s.language || 'text'),
          code: String(s.code ?? ''),
          typingSpeed: clamp(Number(s.typingSpeed) || 22, 4, 80),
          highlightSyntax: s.highlightSyntax !== false,
          cursorVisible: s.cursorVisible !== false,
          fontSize: Number(s.fontSize) || undefined,
          title: s.title ? String(s.title) : undefined,
          ...base,
        };
      case 'terminal':
        return {
          type: 'terminal',
          output: String(s.output ?? ''),
          command: s.command ? String(s.command) : undefined,
          prompt: s.prompt ? String(s.prompt) : '$ ',
          typingSpeed: clamp(Number(s.typingSpeed) || 40, 4, 120),
          fontSize: Number(s.fontSize) || undefined,
          sound: s.sound !== false,
          ...base,
        };
      case 'text':
        return {
          type: 'text',
          content: String(s.content ?? ''),
          position: s.position || 'bottom',
          fontSize: Number(s.fontSize) || undefined,
          color: s.color ? String(s.color) : undefined,
          fadeIn: s.fadeIn != null ? Number(s.fadeIn) : 0.4,
          fadeOut: s.fadeOut != null ? Number(s.fadeOut) : 0.4,
          ...base,
        };
      case 'click':
        return {
          type: 'click',
          button: String(s.button || 'run'),
          sound: s.sound !== false,
          ...base,
        };
      case 'highlight':
        return {
          type: 'highlight',
          startLine: Number(s.startLine) || 1,
          endLine: Number(s.endLine) || 1,
          color: s.color ? String(s.color) : undefined,
          ...base,
        };
      case 'title':
        return {
          type: 'title',
          text: String(s.text ?? s.content ?? 'Untitled'),
          subtitle: s.subtitle ? String(s.subtitle) : undefined,
          accentColor: s.accentColor ? String(s.accentColor) : undefined,
          ...base,
        };
      case 'diff':
        return {
          type: 'diff',
          language: String(s.language || 'text'),
          before: String(s.before ?? ''),
          after: String(s.after ?? ''),
          typingSpeed: clamp(Number(s.typingSpeed) || 18, 4, 80),
          fontSize: Number(s.fontSize) || undefined,
          title: s.title ? String(s.title) : undefined,
          ...base,
        };
      case 'sprite':
        return {
          type: 'sprite',
          template: String(s.template || 'ball'),
          x: isFinite(Number(s.x)) ? Number(s.x) : 0.5,
          y: isFinite(Number(s.y)) ? Number(s.y) : 0.5,
          scale: clamp(Number(s.scale) || 1, 0.05, 20),
          props: s.props && typeof s.props === 'object' ? s.props : {},
          animations: Array.isArray(s.animations)
            ? (s.animations.map(normKeyframe).filter(Boolean) as Keyframe[])
            : [],
          ...base,
        };
      case 'bullets':
        return {
          type: 'bullets',
          title: s.title ? String(s.title) : undefined,
          items: Array.isArray(s.items)
            ? s.items.map((it: any) => String(it)).filter(Boolean).slice(0, 8)
            : [],
          ...base,
        };
      case 'diagram': {
        const nodes = Array.isArray(s.nodes)
          ? s.nodes
              .filter((n: any) => n && n.id != null)
              .map((n: any) => ({
                id: String(n.id),
                label: String(n.label ?? n.id),
                x: clamp(isFinite(Number(n.x)) ? Number(n.x) : 0.5, 0.05, 0.95),
                y: clamp(isFinite(Number(n.y)) ? Number(n.y) : 0.5, 0.1, 0.9),
                color: n.color ? String(n.color) : undefined,
              }))
              .slice(0, 10)
          : [];
        const ids = new Set(nodes.map((n: any) => n.id));
        const edges = Array.isArray(s.edges)
          ? s.edges
              .filter((e: any) => e && ids.has(String(e.from)) && ids.has(String(e.to)))
              .map((e: any) => ({
                from: String(e.from),
                to: String(e.to),
                label: e.label ? String(e.label) : undefined,
              }))
          : [];
        return { type: 'diagram', title: s.title ? String(s.title) : undefined, nodes, edges, ...base };
      }
      case 'quote':
        return {
          type: 'quote',
          text: String(s.text ?? s.content ?? ''),
          attribution: s.attribution ? String(s.attribution) : undefined,
          ...base,
        };
      case 'bigstat':
        return {
          type: 'bigstat',
          value: String(s.value ?? '—'),
          label: String(s.label ?? ''),
          ...base,
        };
      case 'chapter':
        return {
          type: 'chapter',
          number: isFinite(Number(s.number)) ? Number(s.number) : undefined,
          text: String(s.text ?? s.title ?? 'Chapter'),
          ...base,
        };
      case 'mascot':
        return {
          type: 'mascot',
          action: MASCOT_ACTIONS.includes(s.action) ? s.action : 'wave',
          line: isFinite(Number(s.line)) && Number(s.line) > 0 ? Math.round(Number(s.line)) : undefined,
          side: s.side === 'left' ? 'left' : 'right',
          ...base,
        };
      case 'quiz': {
        const options = Array.isArray(s.options)
          ? s.options.map((o: any) => String(o)).filter(Boolean).slice(0, 4)
          : [];
        return {
          type: 'quiz',
          question: String(s.question ?? ''),
          options,
          answerIndex: clamp(Number(s.answerIndex) || 0, 0, Math.max(0, options.length - 1)),
          explanation: s.explanation ? String(s.explanation) : undefined,
          ...base,
        };
      }
      case 'viz': {
        const steps = Array.isArray(s.steps)
          ? s.steps.slice(0, 16).map((st: any) => ({
              caption: st.caption ? String(st.caption) : undefined,
              array: Array.isArray(st.array) ? st.array.map((v: any) => String(v)).slice(0, 16) : undefined,
              highlight: Array.isArray(st.highlight) ? st.highlight.map((n: any) => Number(n)).filter((n: number) => isFinite(n)) : undefined,
              compare: Array.isArray(st.compare) && st.compare.length === 2 ? [Number(st.compare[0]), Number(st.compare[1])] as [number, number] : undefined,
              done: Array.isArray(st.done) ? st.done.map((n: any) => Number(n)).filter((n: number) => isFinite(n)) : undefined,
              pointers: Array.isArray(st.pointers)
                ? st.pointers.filter((p: any) => p && p.name != null && isFinite(Number(p.index))).map((p: any) => ({ name: String(p.name), index: Number(p.index) })).slice(0, 6)
                : undefined,
              vars: st.vars && typeof st.vars === 'object' ? Object.fromEntries(Object.entries(st.vars).slice(0, 6).map(([k, v]) => [String(k), String(v)])) : undefined,
              stack: Array.isArray(st.stack) ? st.stack.map((v: any) => String(v)).slice(0, 10) : undefined,
            }))
          : [];
        return {
          type: 'viz',
          title: s.title ? String(s.title) : undefined,
          vizKind: ['array', 'stack', 'vars'].includes(s.vizKind) ? s.vizKind : 'array',
          steps,
          ...base,
        };
      }
      case 'challenge': {
        const tests = Array.isArray(s.tests)
          ? s.tests
              .filter((t: any) => t && typeof t.expression === 'string')
              .map((t: any) => ({ expression: String(t.expression), expected: String(t.expected ?? '') }))
              .slice(0, 8)
          : [];
        return {
          type: 'challenge',
          language: String(s.language || 'python'),
          prompt: String(s.prompt ?? ''),
          starterCode: String(s.starterCode ?? ''),
          solution: String(s.solution ?? ''),
          tests,
          hint: s.hint ? String(s.hint) : undefined,
          concept: s.concept ? String(s.concept) : undefined,
          ...base,
        };
      }
      case 'wait':
      default:
        return { type: 'wait', ...base };
    }
  });

  const computedDuration = scenes.reduce(
    (max, s) => Math.max(max, s.startTime + s.duration),
    0,
  );

  return {
    title: String(raw.title || 'Untitled Animation'),
    duration: Math.max(Number(raw.duration) || 0, computedDuration),
    fps,
    width: Number(raw.width) || DEFAULTS.width,
    height: Number(raw.height) || DEFAULTS.height,
    backgroundColor: String(raw.backgroundColor || DEFAULTS.backgroundColor),
    voice: raw.voice ? String(raw.voice) : undefined,
    captions: raw.captions !== false,
    scenes,
  };
}

/** Pull the first balanced JSON object out of a possibly chatty model response. */
export function extractJSON(text: string): string {
  let t = text.trim();
  // strip <think> blocks that reasoning models (qwen3) emit
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // strip markdown fences
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in model output');

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  throw new Error('Unterminated JSON object in model output');
}

/**
 * Re-time a code/terminal timeline for comfortable pacing:
 *  - slows typing to a readable speed
 *  - sequences sections with clear gaps
 *  - inserts a ~1s beat after a Run click before the output appears
 * Captions/highlights become overlays on the section they belong to.
 * Sprite timelines are returned untouched (their keyframes own the timing).
 */
export function repace(dsl: AnimationDSL): AnimationDSL {
  if (dsl.scenes.some((s) => s.type === 'sprite')) return dsl;

  const SECTION_GAP = 0.22;
  const AFTER_CLICK_PAUSE = 0.35; // brief beat between Run and output — not dead air
  let cursor = 0;
  let panelStart = 0;
  let panelEnd = 0;

  const scenes: Scene[] = dsl.scenes.map((s): Scene => {
    switch (s.type) {
      case 'code': {
        // morph-from-empty: lines cascade in, then a SHORT buffer. The real hold
        // comes from narration (paceToNarration) — a big fixed pad would leave
        // silent dead air, so keep it tight and let the voice own the pacing.
        const T = morphTiming(diffLines('', s.code));
        const readTime = clamp(s.code.split('\n').length * 0.15, 0.5, 1.6);
        const start = cursor;
        const duration = T.total + readTime;
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'terminal': {
        const speed = clamp(s.typingSpeed * 0.75, 10, 34);
        const typeDur = typeDuration(s.output, speed);
        const start = cursor;
        const duration = typeDur + 0.9;
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, typingSpeed: speed, startTime: start, duration };
      }
      case 'diff': {
        // magic-move morph: kept code slides, removals fade, additions land.
        // Short buffer only; narration owns the hold (see code case above).
        const lines = diffLines(s.before, s.after);
        const T = morphTiming(lines);
        const readTime = clamp(lines.filter((l) => l.kind === 'added').length * 0.2, 0.5, 1.6);
        const start = cursor;
        const duration = T.total + readTime;
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'title':
      case 'chapter':
      case 'quote':
      case 'bigstat': {
        const start = cursor;
        const duration = Math.max(s.duration, 2.4);
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'bullets': {
        // each point needs its beat: reveal stagger + reading time
        const start = cursor;
        const duration = Math.max(s.duration, 1.4 + s.items.length * 0.9);
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'diagram': {
        const start = cursor;
        const duration = Math.max(s.duration, 1.6 + s.nodes.length * 0.45 + s.edges.length * 0.35);
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'viz': {
        // each step needs a beat to read; narration stretches it further
        const start = cursor;
        const duration = Math.max(s.duration, 1.2 + s.steps.length * 1.3);
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'quiz': {
        // export needs time to read the question and reveal the answer; the
        // interactive player pauses here anyway.
        const start = cursor;
        const duration = Math.max(s.duration, 5 + s.options.length * 0.8);
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'challenge': {
        // the interactive player pauses here for the learner to solve; export
        // shows the prompt then reveals the solution.
        const start = cursor;
        const duration = Math.max(s.duration, 8);
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'click': {
        const start = cursor;
        const duration = 0.5;
        cursor = start + duration + AFTER_CLICK_PAUSE;
        return { ...s, startTime: start, duration };
      }
      case 'wait': {
        const start = cursor;
        cursor = start + s.duration;
        return { ...s, startTime: start };
      }
      case 'text':
      case 'mascot':
      case 'highlight': {
        // overlay on the current section (does not consume the timeline)
        if (panelEnd > 0) {
          const start = Math.min(panelStart + 0.3, panelEnd - 0.6);
          const duration = Math.max(1, panelEnd - start);
          return { ...s, startTime: start, duration };
        }
        const start = cursor;
        cursor = start + s.duration;
        return { ...s, startTime: start };
      }
      default:
        return s;
    }
  });

  const duration = scenes.reduce((m, s) => Math.max(m, s.startTime + s.duration), 0);
  return { ...dsl, scenes, duration };
}

/**
 * Stretch the timeline so every narrated scene stays on screen at least as long
 * as its synthesized speech — the sync work a video editor normally exists for.
 * A scene that grows pushes everything that starts at/after its old end; overlays
 * that begin inside it keep their place (they still sit within the longer scene).
 */
export function paceToNarration(
  dsl: AnimationDSL,
  narrationSeconds: Map<number, number>,
): AnimationDSL {
  const PAD = 0.28; // breathing room after the voice stops (keep short — silence reads as "broken")

  const events: { at: number; delta: number }[] = [];
  const grown = new Map<number, number>();
  dsl.scenes.forEach((s, i) => {
    const need = narrationSeconds.get(i);
    if (!need) return;
    const newDur = Math.max(s.duration, need + PAD);
    grown.set(i, newDur);
    if (newDur > s.duration + 1e-3) {
      events.push({ at: s.startTime + s.duration, delta: newDur - s.duration });
    }
  });
  if (!events.length && !grown.size) return dsl;
  events.sort((a, b) => a.at - b.at);

  const shiftAt = (t: number) =>
    events.reduce((acc, e) => (t >= e.at - 1e-6 ? acc + e.delta : acc), 0);

  const scenes: Scene[] = dsl.scenes.map((s, i) => ({
    ...s,
    startTime: s.startTime + shiftAt(s.startTime),
    duration: grown.get(i) ?? s.duration,
    narrationDuration: narrationSeconds.get(i),
  }));

  const duration = scenes.reduce((m, s) => Math.max(m, s.startTime + s.duration), 0);
  return { ...dsl, scenes, duration };
}

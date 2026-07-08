import { AnimationDSL, AnimProp, Easing, Keyframe, Scene } from './types';
import { clamp } from './utils';
import { typeDuration } from './timing';

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
  backgroundColor: '#0d0d0f',
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

    const base = { startTime, duration };

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

  const SECTION_GAP = 0.45;
  const AFTER_CLICK_PAUSE = 1.0;
  let cursor = 0;
  let panelStart = 0;
  let panelEnd = 0;

  const scenes: Scene[] = dsl.scenes.map((s): Scene => {
    switch (s.type) {
      case 'code': {
        // slow, human typing speed; typeDuration accounts for per-line pauses
        const speed = clamp(s.typingSpeed * 0.6, 5, 8.5);
        const typeDur = typeDuration(s.code, speed);
        const start = cursor;
        const duration = typeDur + 0.6;
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, typingSpeed: speed, startTime: start, duration };
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

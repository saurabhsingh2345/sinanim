import { AnimationDSL, AnimProp, BrowserBlock, CliCommand, Easing, IdeAction, IdeFile, IdeStep, Keyframe, LayoutRegion, Scene, SceneTransition, SplitStep } from './types';
import { clamp } from './utils';
import { typeDuration } from './timing';
import { diffLines } from './diff';
import { morphTiming } from './morph';
import { THEME_IDS, DEFAULT_THEME_ID } from './themes';

const MASCOT_ACTIONS = ['wave', 'point', 'think', 'celebrate', 'shocked', 'idle'];
const TRANSITIONS: SceneTransition[] = ['none', 'fade', 'slide', 'push', 'zoom'];

const ANIM_PROPS: AnimProp[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];
const EASINGS: Easing[] = ['linear', 'easeInOut', 'easeInCubic', 'easeOutCubic', 'easeOutBack'];

function normTheme(raw: any): string | Record<string, unknown> | undefined {
  if (typeof raw === 'string') {
    if (raw === 'light' || raw === 'dark') return undefined; // page themes, not packs
    return THEME_IDS.includes(raw) ? raw : undefined;
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return undefined;
}

function normTransition(raw: any): SceneTransition | undefined {
  return TRANSITIONS.includes(raw) ? raw : undefined;
}

function sceneExtras(s: any) {
  const theme = normTheme(s.theme);
  const style = s.style && typeof s.style === 'object' ? s.style : undefined;
  const transition = normTransition(s.transition);
  return {
    ...(theme ? { theme } : {}),
    ...(style ? { style } : {}),
    ...(transition ? { transition } : {}),
  };
}

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

/** Best-effort language id from a file extension (for IDE syntax colors). */
export function inferLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', jsx: 'jsx', tsx: 'tsx', json: 'json', html: 'html',
    css: 'css', scss: 'css', sh: 'bash', bash: 'bash', zsh: 'bash',
    md: 'markdown', yml: 'yaml', yaml: 'yaml', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', rb: 'ruby', php: 'php', c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', sql: 'sql', toml: 'toml',
  };
  return map[ext] || 'text';
}

/** Normalize a browser page-block list (used by browser + split scenes). */
function normBlocks(raw: any): BrowserBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: BrowserBlock[] = [];
  for (const b of raw.slice(0, 24)) {
    if (!b || !b.kind) continue;
    switch (String(b.kind)) {
      case 'nav': out.push({ kind: 'nav', brand: String(b.brand ?? 'Brand'), links: Array.isArray(b.links) ? b.links.map(String).slice(0, 5) : undefined }); break;
      case 'hero': out.push({ kind: 'hero', heading: String(b.heading ?? ''), sub: b.sub ? String(b.sub) : undefined, cta: b.cta ? String(b.cta) : undefined }); break;
      case 'button': out.push({ kind: 'button', label: String(b.label ?? 'Button'), primary: b.primary !== false }); break;
      case 'card': out.push({ kind: 'card', title: String(b.title ?? ''), body: b.body ? String(b.body) : undefined }); break;
      case 'text': out.push({ kind: 'text', text: String(b.text ?? '') }); break;
      case 'input': out.push({ kind: 'input', placeholder: String(b.placeholder ?? ''), value: b.value ? String(b.value) : undefined }); break;
      case 'image': out.push({ kind: 'image', label: b.label ? String(b.label) : undefined }); break;
      case 'code': out.push({ kind: 'code', text: String(b.text ?? '') }); break;
      case 'html': {
        const html = String(b.html ?? '').slice(0, 2000).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        if (html.trim()) out.push({ kind: 'html', html });
        break;
      }
      case 'search':
        out.push({
          kind: 'search',
          query: String(b.query ?? ''),
          engine: b.engine ? String(b.engine) : undefined,
        });
        break;
      case 'serp': {
        const results = Array.isArray(b.results)
          ? b.results
              .filter((r: any) => r && (r.title != null || r.url != null))
              .slice(0, 8)
              .map((r: any) => ({
                title: String(r.title ?? 'Result'),
                url: String(r.url ?? 'https://example.com'),
                snippet: String(r.snippet ?? ''),
              }))
          : [];
        if (results.length) out.push({ kind: 'serp', results });
        break;
      }
      case 'docs':
        out.push({
          kind: 'docs',
          heading: String(b.heading ?? ''),
          body: String(b.body ?? ''),
          sidebar: Array.isArray(b.sidebar) ? b.sidebar.map(String).slice(0, 10) : undefined,
          active: b.active ? String(b.active) : undefined,
          highlight: b.highlight ? String(b.highlight) : undefined,
        });
        break;
    }
  }
  return out;
}

const DEFAULTS = {
  fps: 30,
  width: 1920,
  height: 1080,
  backgroundColor: '#0b0b10',
};

// ── IDE step hygiene ───────────────────────────────────────────────────────────
const DEV_SERVER_RE = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve)\b|\bvite\b|\bnext\s+dev\b|\breact-scripts\s+start\b/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A believable dev-server banner — frontend apps render in a browser, they do
 *  NOT print program output to the integrated terminal. */
function devServerBanner(command: string): string {
  const next = /next/i.test(command);
  const port = next ? 3000 : 5173;
  const tool = next ? 'next' : 'vite';
  const ver = next ? '14.2.3' : 'v5.2.0';
  return [
    ``,
    `  ${tool} ${ver}  ready in 486 ms`,
    ``,
    `  ➜  Local:   http://localhost:${port}/`,
    `  ➜  Network: use --host to expose`,
    `  ➜  press h + enter to show help`,
  ].join('\n');
}

/** Make successive "type" steps on the same file CUMULATIVE.
 *
 *  Contract (see the ide example in the system prompt): each type step should
 *  carry the WHOLE file so far, so the renderer diffs it against the previous
 *  buffer and types only the genuinely-new lines in place. Models routinely
 *  break that contract and emit just the new chunk per step. When they do, the
 *  line-diff sees the old lines as "removed" and retypes the chunk on row 1 —
 *  which reads as "it writes a line, then erases it and types the next on top".
 *
 *  So we reconstruct the running buffer ourselves: if a type step's code is not
 *  already an extension of what's on screen, we treat it as an append and glue
 *  it below. Correct cumulative authoring (code starts with the prev buffer) is
 *  left untouched.
 */
function firstCodeLine(s: string): string {
  for (const l of s.split('\n')) { const t = l.trim(); if (t) return t; }
  return '';
}

/**
 * Reconcile a `type` step's `code` with the file's current buffer `prev` into
 * the file's intended full contents. The hard part is telling two cases apart
 * when neither string is a prefix of the other:
 *
 *   REVISE  — the step shows an evolved version of the SAME code (fix a bug, add
 *             a parameter, flesh out a stub). The whole block should be REPLACED
 *             and the editor diffs old→new in place. e.g. `class Coffee: pass`
 *             becoming `class Coffee:` with a real `__init__`.
 *   APPEND  — the step adds genuinely NEW code below what exists (call the
 *             function we just wrote, add a second helper). Glue it on the end.
 *
 * Getting this wrong is what produced the "same code written three times" stack:
 * every revision was glued below the last instead of replacing it. We treat it as
 * a revision when it opens with the same construct (same first line) or shares a
 * good chunk of lines; otherwise it's new code and we append.
 */
export function mergeIdeBuffer(prev: string, code: string): string {
  if (!prev.trim()) return code;
  if (!code.trim()) return prev;
  if (code.startsWith(prev)) return code; // cumulative — already includes the prior buffer
  if (prev.startsWith(code)) return prev; // a prefix of what's there — keep the longer buffer
  const pl = prev.split('\n').map((s) => s.trim()).filter(Boolean);
  const cl = code.split('\n').map((s) => s.trim()).filter(Boolean);
  const pset = new Set(pl);
  const shared = cl.filter((l) => pset.has(l)).length;
  const overlap = shared / Math.max(Math.min(pl.length, cl.length), 1);
  const sameHead = firstCodeLine(prev) === firstCodeLine(code);
  if (sameHead || overlap >= 0.5) return code; // a revision of the same block → replace (editor diffs)
  return prev + (prev.endsWith('\n') ? '' : '\n') + code; // genuinely new code → append below
}

function cumulativeIdeTypes(steps: IdeStep[], files: IdeFile[]): IdeStep[] {
  const buffers = new Map<string, string>(files.map((f) => [f.path, f.code || '']));
  return steps.map((st) => {
    if (st.action.kind !== 'type') return st;
    const file = st.action.file;
    const prev = buffers.get(file) || '';
    const code = st.action.code;
    const full = mergeIdeBuffer(prev, code);
    buffers.set(file, full);
    return full === code ? st : { ...st, action: { ...st.action, code: full } };
  });
}

/**
 * Thread ONE persistent workspace across every `ide` scene in a lesson.
 *
 * Within a scene, typing is already cumulative. But a lesson often has several
 * `ide` scenes, and each was starting from an EMPTY workspace — so scene 3 would
 * re-open app.py blank and retype from line 1, throwing away what scenes 1-2
 * wrote. That's the "every scene writes a new file from line one" bug.
 *
 * This pass carries each file's accumulated contents forward: when a later `ide`
 * scene touches a file that already exists, its prior code is shown immediately
 * (visible in the tree + editor) and the scene's new typing continues BELOW it.
 * Files a terminal command scaffolds (`run.creates`) also enter the workspace.
 */
function threadIdeWorkspace(scenes: Scene[]): void {
  const workspace = new Map<string, string>(); // path -> full accumulated code
  const langs = new Map<string, string>();

  for (const scene of scenes) {
    if (scene.type !== 'ide') continue;
    const ide = scene as any as { files: IdeFile[]; steps: IdeStep[] };
    ide.files = ide.files || [];
    ide.steps = ide.steps || [];

    // 1. Seed carried-over files so their prior contents show from the first
    //    frame (visible in the tree + editor). This is the value BEFORE this
    //    scene edits it, so `type` steps morph old→new in place.
    workspace.forEach((code, path) => {
      let f = ide.files.find((x) => x.path === path);
      if (!f) { f = { path, language: langs.get(path), code }; ide.files.push(f); }
      else if (!(f.code || '').trim()) f.code = code;
    });

    // 2. Run a per-file buffer through this scene's steps, seeded from the
    //    workspace, using the SAME revise-vs-append reconciliation as within a
    //    scene. A revision replaces (and the editor diffs it); genuinely new code
    //    appends. No more blind gluing that stacked duplicate copies.
    const local = new Map<string, string>();
    workspace.forEach((code, path) => local.set(path, code));
    ide.files.forEach((f) => { if (!local.has(f.path)) local.set(f.path, f.code || ''); });
    ide.steps = ide.steps.map((st) => {
      if (st.action.kind === 'type') {
        const file = st.action.file;
        const merged = mergeIdeBuffer(local.get(file) || '', st.action.code);
        local.set(file, merged);
        return merged === st.action.code ? st : { ...st, action: { ...st.action, code: merged } };
      }
      if (st.action.kind === 'run' && st.action.creates) {
        for (const p of st.action.creates) if (!local.has(p)) local.set(p, '');
      }
      return st;
    });

    // 3. Commit this scene's final buffers into the persistent workspace.
    local.forEach((code, path) => {
      workspace.set(path, code);
      if (!langs.has(path)) langs.set(path, inferLang(path));
    });
  }
}

/** Clean up authored IDE steps so the renderer never shows nonsense:
 *  - drop a caption that just repeats the step's own narration (no triple-say)
 *  - replace fabricated program stdout for a frontend dev server with a real
 *    dev-server banner + localhost URL (React/Vite/Next don't print to a terminal)
 */
function refineIdeSteps(steps: IdeStep[], files: IdeFile[]): IdeStep[] {
  const frontend =
    files.some((f) => /\.(jsx|tsx)$/i.test(f.path)) ||
    steps.some(
      (st) =>
        st.action.kind === 'type' &&
        /\bfrom\s+['"]react['"]|import\s+React\b|createRoot|ReactDOM|from\s+['"]vue['"]/.test(st.action.code),
    );
  return steps.map((st) => {
    let caption = st.caption;
    if (caption && st.narration) {
      const c = norm(caption), n = norm(st.narration);
      if (c.length > 3 && (n.includes(c) || c.includes(n))) caption = undefined;
    }
    let action = st.action;
    if (
      action.kind === 'run' &&
      DEV_SERVER_RE.test(action.command) &&
      (frontend || /vite|next|react-scripts/i.test(action.command))
    ) {
      action = { kind: 'run', command: action.command, output: devServerBanner(action.command) };
    }
    return caption === st.caption && action === st.action ? st : { ...st, caption, action };
  });
}

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
      ...sceneExtras(s),
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
          syncWord: s.syncWord ? String(s.syncWord) : undefined,
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
        return {
          type: 'diagram',
          title: s.title ? String(s.title) : undefined,
          nodes,
          edges,
          aesthetic: s.aesthetic === 'sketch' ? 'sketch' : 'clean',
          ...base,
        };
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
      case 'ide': {
        const files: IdeFile[] = Array.isArray(s.files)
          ? s.files
              .filter((f: any) => f && f.path != null)
              .map((f: any) => ({
                path: String(f.path),
                language: f.language ? String(f.language) : inferLang(String(f.path)),
                code: f.code != null ? String(f.code) : '',
              }))
              .slice(0, 24)
          : [];
        const steps: IdeStep[] = Array.isArray(s.steps)
          ? (s.steps
              .map((st: any): IdeStep | null => {
                const a = st && (st.action ?? st); // tolerate a flat action object
                const kind = String(a?.kind ?? a?.type ?? '');
                let action: IdeAction | null = null;
                if (kind === 'open') action = { kind: 'open', file: String(a.file ?? '') };
                else if (kind === 'create') action = { kind: 'create', file: String(a.file ?? '') };
                else if (kind === 'type')
                  action = {
                    kind: 'type',
                    file: String(a.file ?? ''),
                    code: String(a.code ?? ''),
                    typingSpeed: a.typingSpeed ? clamp(Number(a.typingSpeed), 4, 80) : undefined,
                  };
                else if (kind === 'run')
                  action = {
                    kind: 'run',
                    command: String(a.command ?? ''),
                    output: a.output != null ? String(a.output) : undefined,
                    creates: Array.isArray(a.creates)
                      ? a.creates.map((f: any) => String(f)).filter(Boolean).slice(0, 40)
                      : undefined,
                  };
                else if (kind === 'highlight')
                  action = {
                    kind: 'highlight',
                    file: a.file ? String(a.file) : undefined,
                    startLine: Math.max(1, Number(a.startLine) || 1),
                    endLine: Math.max(1, Number(a.endLine) || Number(a.startLine) || 1),
                  };
                else if (kind === 'explain')
                  action = {
                    kind: 'explain',
                    file: a.file ? String(a.file) : undefined,
                    startLine: a.startLine != null ? Math.max(1, Number(a.startLine) || 1) : undefined,
                    endLine:
                      a.endLine != null || a.startLine != null
                        ? Math.max(1, Number(a.endLine) || Number(a.startLine) || 1)
                        : undefined,
                    terminal: a.terminal === true || a.target === 'terminal' ? true : undefined,
                  };
                if (!action) return null;
                return {
                  caption: st.caption ? String(st.caption) : undefined,
                  action,
                  narration:
                    typeof st.narration === 'string' && st.narration.trim()
                      ? st.narration.trim()
                      : undefined,
                  key: st.key ? String(st.key) : undefined,
                  weight: st.weight ? clamp(Number(st.weight), 0.2, 5) : undefined,
                };
              })
              .filter(Boolean) as IdeStep[]).slice(0, 32)
          : [];
        const refinedSteps = refineIdeSteps(cumulativeIdeTypes(steps, files), files);
        // Files touched only by steps are NOT pre-added — they pop into the tree
        // when their step runs (a "created" file appears live). Files listed here
        // are the project's existing files, visible from the start.
        //
        // The scene's own `narration` stays the short INTRO; the teaching lives
        // in each step's narration. The full spoken text is derived on read via
        // spokenNarration() (TTS/captions/QA) — never baked back into this field,
        // or the LLM critic/narration/lint passes would re-compose it every pass
        // and stack the whole script 2-4×. step-sync maps synthesized sentence
        // offsets back to step start times so each beat lands with its own words.
        return {
          type: 'ide',
          project: s.project ? String(s.project) : undefined,
          branch: s.branch ? String(s.branch) : undefined,
          showMenu: s.showMenu === false ? false : undefined,
          files,
          steps: refinedSteps,
          ...base,
        };
      }
      case 'cli': {
        const commands: CliCommand[] = Array.isArray(s.commands)
          ? s.commands
              .filter((c: any) => c && (c.command != null))
              .map((c: any) => ({
                command: String(c.command ?? ''),
                output: c.output != null ? String(c.output) : undefined,
                weight: c.weight ? clamp(Number(c.weight), 0.2, 5) : undefined,
              }))
              .slice(0, 20)
          : [];
        return { type: 'cli', title: s.title ? String(s.title) : undefined, cwd: s.cwd ? String(s.cwd) : undefined, commands, ...base };
      }
      case 'browser': {
        const pageTheme =
          s.pageTheme === 'dark' || s.theme === 'dark'
            ? 'dark'
            : 'light';
        const tabs = Array.isArray(s.tabs)
          ? s.tabs
              .filter((t: any) => t && t.title != null)
              .slice(0, 8)
              .map((t: any) => ({
                title: String(t.title),
                url: t.url ? String(t.url) : undefined,
                active: !!t.active,
              }))
          : undefined;
        return {
          type: 'browser',
          url: String(s.url ?? 'localhost:3000'),
          title: s.title ? String(s.title) : undefined,
          pageTheme,
          tabs,
          blocks: normBlocks(s.blocks),
          clickBlock: isFinite(Number(s.clickBlock)) ? Number(s.clickBlock) : undefined,
          ...base,
        };
      }
      case 'browserrec':
        return {
          type: 'browserrec',
          src: String(s.src ?? ''),
          title: s.title ? String(s.title) : undefined,
          url: s.url ? String(s.url) : undefined,
          clipStart: isFinite(Number(s.clipStart)) ? Math.max(0, Number(s.clipStart)) : undefined,
          ...base,
        };
      case 'split': {
        const steps: SplitStep[] = Array.isArray(s.steps)
          ? s.steps.map((st: any) => ({
              caption: st.caption ? String(st.caption) : undefined,
              code: String(st.code ?? ''),
              blocks: normBlocks(st.blocks),
              weight: st.weight ? clamp(Number(st.weight), 0.2, 5) : undefined,
            })).slice(0, 16)
          : [];
        const pageTheme =
          s.pageTheme === 'dark' || s.theme === 'dark'
            ? 'dark'
            : 'light';
        return {
          type: 'split',
          language: String(s.language || 'html'),
          filename: s.filename ? String(s.filename) : undefined,
          url: s.url ? String(s.url) : undefined,
          pageTheme,
          steps,
          ...base,
        };
      }
      case 'layout': {
        const regions: LayoutRegion[] = Array.isArray(s.regions)
          ? s.regions.slice(0, 4).map((r: any): LayoutRegion => {
              const type = r?.type === 'browser' || r?.type === 'cli' ? r.type : 'ide';
              const region: LayoutRegion = { type };
              if (r.rect && typeof r.rect === 'object') {
                region.rect = {
                  x: clamp(Number(r.rect.x) || 0, 0, 1),
                  y: clamp(Number(r.rect.y) || 0, 0, 1),
                  w: clamp(Number(r.rect.w) || 0.5, 0.1, 1),
                  h: clamp(Number(r.rect.h) || 0.5, 0.1, 1),
                };
              }
              if (type === 'ide') {
                region.project = r.project ? String(r.project) : undefined;
                region.files = Array.isArray(r.files)
                  ? r.files.filter((f: any) => f?.path).map((f: any) => ({
                      path: String(f.path),
                      language: f.language ? String(f.language) : inferLang(String(f.path)),
                      code: f.code != null ? String(f.code) : '',
                    })).slice(0, 24)
                  : [];
                region.steps = Array.isArray(r.steps) ? r.steps.slice(0, 24).map((st: any) => {
                  const a = st?.action ?? st;
                  const kind = String(a?.kind ?? '');
                  let action: IdeAction | null = null;
                  if (kind === 'open') action = { kind: 'open', file: String(a.file ?? '') };
                  else if (kind === 'create') action = { kind: 'create', file: String(a.file ?? '') };
                  else if (kind === 'type') action = { kind: 'type', file: String(a.file ?? ''), code: String(a.code ?? '') };
                  else if (kind === 'run') action = { kind: 'run', command: String(a.command ?? ''), output: a.output != null ? String(a.output) : undefined };
                  else if (kind === 'highlight') action = { kind: 'highlight', startLine: Number(a.startLine) || 1, endLine: Number(a.endLine) || 1 };
                  return action ? { caption: st.caption ? String(st.caption) : undefined, action } : null;
                }).filter(Boolean) as IdeStep[] : [];
              } else if (type === 'browser') {
                region.url = String(r.url ?? 'localhost:3000');
                region.title = r.title ? String(r.title) : undefined;
                region.pageTheme = r.pageTheme === 'dark' || r.theme === 'dark' ? 'dark' : 'light';
                region.blocks = normBlocks(r.blocks);
                region.clickBlock = isFinite(Number(r.clickBlock)) ? Number(r.clickBlock) : undefined;
              } else {
                region.title = r.title ? String(r.title) : undefined;
                region.cwd = r.cwd ? String(r.cwd) : undefined;
                region.commands = Array.isArray(r.commands)
                  ? r.commands.filter((c: any) => c?.command != null).map((c: any) => ({
                      command: String(c.command),
                      output: c.output != null ? String(c.output) : undefined,
                      weight: c.weight ? clamp(Number(c.weight), 0.2, 5) : undefined,
                    })).slice(0, 20)
                  : [];
              }
              return region;
            })
          : [];
        const preset = ['ide-browser', 'cli-browser', 'ide-only', 'ide-cli', 'custom'].includes(s.preset)
          ? s.preset
          : regions.length <= 1
            ? 'ide-only'
            : 'ide-browser';
        return {
          type: 'layout',
          preset,
          focus: isFinite(Number(s.focus)) ? Number(s.focus) : 0,
          regions,
          ...base,
        };
      }
      case 'api': {
        const headers =
          s.headers && typeof s.headers === 'object' && !Array.isArray(s.headers)
            ? Object.fromEntries(
                Object.entries(s.headers as Record<string, unknown>).map(([k, v]) => [String(k), String(v)]),
              )
            : undefined;
        const query =
          s.query && typeof s.query === 'object' && !Array.isArray(s.query)
            ? Object.fromEntries(
                Object.entries(s.query as Record<string, unknown>).map(([k, v]) => [String(k), String(v)]),
              )
            : undefined;
        return {
          type: 'api',
          method: String(s.method || 'GET').toUpperCase(),
          url: String(s.url ?? '/api'),
          headers,
          query,
          requestBody: s.requestBody != null ? String(s.requestBody) : undefined,
          status: isFinite(Number(s.status)) ? Number(s.status) : 200,
          statusText: s.statusText ? String(s.statusText) : undefined,
          response: String(s.response ?? '{}'),
          ...base,
        };
      }
      case 'pr': {
        const filename = String(s.filename || 'file.txt');
        return {
          type: 'pr',
          title: s.title ? String(s.title) : undefined,
          filename,
          language: s.language ? String(s.language) : inferLang(filename),
          before: String(s.before ?? ''),
          after: String(s.after ?? ''),
          ...base,
        };
      }
      case 'beat':
        // A deliberate breath after a reveal ("And the result? … nothing.").
        // Renders as a wait, but keeps its own short default so the LLM can
        // drop pauses without inventing durations.
        return { type: 'wait', ...base, duration: clamp(Number(s.duration) || 0.7, 0.2, 3) };
      case 'wait':
      default:
        return { type: 'wait', ...base };
    }
  });

  // Persist file contents across every ide scene so the workspace evolves like a
  // real editing session (no restarting each file from line one).
  threadIdeWorkspace(scenes);

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
    theme: normTheme(raw.theme) || DEFAULT_THEME_ID,
    brand:
      raw.brand && typeof raw.brand === 'object'
        ? {
            name: raw.brand.name ? String(raw.brand.name) : undefined,
            accent: raw.brand.accent ? String(raw.brand.accent) : undefined,
            logoUrl: raw.brand.logoUrl ? String(raw.brand.logoUrl) : undefined,
          }
        : undefined,
    voice: raw.voice ? String(raw.voice) : undefined,
    captions: raw.captions !== false,
    sfx: raw.sfx !== false,
    music: raw.music !== false,
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
      case 'ide': {
        // A full IDE walkthrough: each step needs a beat, typing/running more so.
        // Narration (paceToNarration) stretches it further to fit the voice.
        const start = cursor;
        const stepTime = s.steps.reduce(
          (a, st) => a + (st.action.kind === 'type' ? 1.7 : st.action.kind === 'run' ? 1.5 : 0.9),
          0,
        );
        const duration = Math.max(s.duration, 1.2 + stepTime);
        panelStart = start;
        panelEnd = start + duration;
        cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'cli': {
        const start = cursor;
        const t = s.commands.reduce((acc, c) => acc + 0.9 + typeDuration(c.output || '', 34), 0);
        const duration = Math.max(s.duration, 1 + t);
        panelStart = start; panelEnd = start + duration; cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'browser': {
        const start = cursor;
        const duration = Math.max(s.duration, 2 + s.blocks.length * 0.8);
        panelStart = start; panelEnd = start + duration; cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'browserrec': {
        // the clip's own length is the floor; narration can stretch it further
        const start = cursor;
        const duration = Math.max(s.duration, 3);
        panelStart = start; panelEnd = start + duration; cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'split': {
        const start = cursor;
        const duration = Math.max(s.duration, 1.5 + s.steps.length * 2.2);
        panelStart = start; panelEnd = start + duration; cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'api': {
        const start = cursor;
        const duration = Math.max(s.duration, 3.5 + typeDuration(s.response || '', 50));
        panelStart = start; panelEnd = start + duration; cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'pr': {
        const start = cursor;
        const rows = diffLines(s.before, s.after).length;
        const duration = Math.max(s.duration, 2 + rows * 0.32);
        panelStart = start; panelEnd = start + duration; cursor = panelEnd + SECTION_GAP;
        return { ...s, startTime: start, duration };
      }
      case 'layout': {
        const start = cursor;
        const duration = Math.max(s.duration, 8);
        panelStart = start; panelEnd = start + duration; cursor = panelEnd + SECTION_GAP;
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

// Execution grounding (LEAP 1). LLMs *guess* that the code they wrote runs and
// that the terminal output is right. This module actually RUNS every snippet
// during generation and replaces terminal output with the real thing — the
// difference between "impressive demo" and "I trust this with my class".
//
// Server-side only (uses child_process). Two backends:
//   • default: local runtimes — Node for JS, python3 for Python (zero setup)
//   • optional: a Judge0 instance (set JUDGE0_URL) for 60+ languages
// Anything we can't run is left exactly as the model wrote it, untouched.

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RunResult {
  supported: boolean; // did we have a runtime for this language?
  ok: boolean; // ran without error
  stdout: string;
  stderr: string;
}

const UNSUPPORTED: RunResult = { supported: false, ok: false, stdout: '', stderr: '' };
const TIMEOUT_MS = 6000;
const MAX_OUT = 4000; // trim runaway output

function norm(lang: string): 'js' | 'python' | null {
  const l = (lang || '').toLowerCase();
  if (['js', 'javascript', 'node', 'nodejs'].includes(l)) return 'js';
  if (['py', 'python', 'python3'].includes(l)) return 'python';
  return null; // ts/tsx/go/rust/etc. → left to Judge0 or skipped
}

function clip(s: string): string {
  const t = (s || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  return t.length > MAX_OUT ? t.slice(0, MAX_OUT) + '\n…(truncated)' : t;
}

// ── Judge0 backend (optional, opt-in via env) ───────────────────────────────────
const JUDGE0_URL = process.env.JUDGE0_URL; // e.g. http://localhost:2358
const JUDGE0_LANGS: Record<string, number> = { js: 93, python: 71 }; // CE language ids

async function runJudge0(kind: 'js' | 'python', code: string): Promise<RunResult> {
  try {
    const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language_id: JUDGE0_LANGS[kind], source_code: code }),
    });
    if (!res.ok) return UNSUPPORTED;
    const d = await res.json();
    const stdout = clip(d.stdout || '');
    const stderr = clip(d.stderr || d.compile_output || '');
    return { supported: true, ok: (d.status?.id ?? 0) === 3, stdout, stderr };
  } catch {
    return UNSUPPORTED;
  }
}

// ── Local backend ───────────────────────────────────────────────────────────────
function exec(cmd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 1 << 20, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: clip(stdout), stderr: clip(stderr) });
    });
  });
}

async function runLocal(kind: 'js' | 'python', code: string): Promise<RunResult> {
  let dir = '';
  try {
    dir = await mkdtemp(join(tmpdir(), 'newani-run-'));
    const name = kind === 'js' ? 'main.mjs' : 'main.py';
    const file = join(dir, name);
    await writeFile(file, code, 'utf8');
    const r = kind === 'js'
      ? await exec(process.execPath, [file])
      : await exec('python3', [file]);
    // never leak the temp path into a lesson — show the friendly filename
    const scrub = (s: string) => s.split(file).join(name).split(dir).join('');
    return { supported: true, ok: r.ok, stdout: scrub(r.stdout), stderr: scrub(r.stderr) };
  } catch {
    return UNSUPPORTED;
  } finally {
    if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runCode(language: string, code: string): Promise<RunResult> {
  const kind = norm(language);
  if (!kind || !code.trim()) return UNSUPPORTED;
  if (JUDGE0_URL) {
    const r = await runJudge0(kind, code);
    if (r.supported) return r;
  }
  return runLocal(kind, code);
}

/** Wrap a test expression in a print so its value lands on stdout. */
function wrapExpr(language: string, code: string, expression: string): string {
  const l = language.toLowerCase();
  return ['py', 'python', 'python3'].includes(l)
    ? `${code}\n\nprint(${expression})\n`
    : `${code}\n\nconsole.log(${expression});\n`;
}

// ── Ground a whole timeline ─────────────────────────────────────────────────────
// For each terminal scene, run the code currently on screen and replace the
// terminal's output with the REAL output. Guarantees output matches the code.
import { AnimationDSL } from './types';

export async function groundDSL(dsl: AnimationDSL): Promise<{ dsl: AnimationDSL; grounded: number; failures: number }> {
  let currentCode = '';
  let currentLang = '';
  let grounded = 0;
  let failures = 0;

  const scenes = await Promise.resolve(dsl.scenes); // keep order; run sequentially
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i] as any;
    if (s.type === 'code') { currentCode = s.code; currentLang = s.language; }
    else if (s.type === 'diff') { currentCode = s.after; currentLang = s.language; }
    else if (s.type === 'ide' && Array.isArray(s.steps)) {
      // Replay type/create steps into file buffers, then ground each run step.
      const buffers: Record<string, string> = {};
      for (const f of s.files || []) {
        if (f?.path) buffers[f.path] = f.code || '';
      }
      let active = (s.files?.[0]?.path as string) || '';
      for (const step of s.steps) {
        const a = step.action;
        if (!a) continue;
        if (a.kind === 'open' && a.file) active = a.file;
        else if (a.kind === 'create' && a.file) {
          if (!(a.file in buffers)) buffers[a.file] = '';
          active = a.file;
        } else if (a.kind === 'type' && a.code != null) {
          const path = a.file || active;
          if (path) {
            buffers[path] = a.code;
            active = path;
          }
        } else if (a.kind === 'run') {
          const path = active;
          const code = (path && buffers[path]) || '';
          const lang =
            (s.files || []).find((f: { path: string; language?: string }) => f.path === path)?.language ||
            (path?.endsWith('.py') ? 'python' : path?.endsWith('.ts') || path?.endsWith('.tsx') ? 'typescript' : 'javascript');
          if (!code.trim()) continue;
          currentCode = code;
          currentLang = lang;
          const r = await runCode(lang, code);
          if (!r.supported) continue;
          if (r.ok && r.stdout.trim()) {
            a.output = r.stdout;
            grounded++;
          } else if (!r.ok) {
            failures++;
          }
        }
      }
    }
    else if (s.type === 'terminal' && currentCode) {
      const r = await runCode(currentLang, currentCode);
      if (!r.supported) continue; // language we can't run — leave the model's output
      if (r.ok && r.stdout.trim()) {
        // clean success → replace with the REAL output (the core guarantee)
        s.output = r.stdout;
        grounded++;
      } else if (!r.ok) {
        // the snippet didn't run standalone. It may be an incremental fragment
        // (a call without its definition) rather than truly broken — so we DON'T
        // inject the error; we leave the model's output untouched. Counted so the
        // pipeline can see how often grounding couldn't verify.
        failures++;
      }
    }
    else if (s.type === 'challenge' && s.solution && Array.isArray(s.tests) && s.tests.length) {
      // ground the challenge: set each test's `expected` to what the AUTHORED
      // solution actually prints, so a learner's correct solution can't be marked
      // wrong by a hallucinated expected value.
      for (const test of s.tests) {
        const r = await runCode(s.language, wrapExpr(s.language, s.solution, test.expression));
        if (r.supported && r.ok && r.stdout.trim()) {
          test.expected = r.stdout.trim();
          grounded++;
        }
      }
    }
  }
  return { dsl, grounded, failures };
}

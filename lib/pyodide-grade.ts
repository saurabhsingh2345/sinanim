// In-browser Python challenge grading via Pyodide (CDN, free, no server).
// Used when /api/grade is unavailable or returns unsupported.

import type { ChallengeTest } from './types';
import type { GradeResult, TestResult } from './grade';

const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';
let pyodidePromise: Promise<any> | null = null;
let loadListeners: Array<(msg: string) => void> = [];

export function onPyodideStatus(cb: (msg: string) => void): () => void {
  loadListeners.push(cb);
  return () => {
    loadListeners = loadListeners.filter((x) => x !== cb);
  };
}

function emitStatus(msg: string) {
  loadListeners.forEach((cb) => cb(msg));
}

async function loadPyodide(): Promise<any> {
  if (!pyodidePromise) {
    emitStatus('Loading Python in the browser…');
    pyodidePromise = (async () => {
      const mod: any = await import(/* webpackIgnore: true */ `${PYODIDE_BASE}pyodide.mjs`);
      const py = await mod.loadPyodide({ indexURL: PYODIDE_BASE });
      emitStatus('');
      return py;
    })();
    pyodidePromise.catch(() => {
      pyodidePromise = null;
      emitStatus('');
    });
  }
  return pyodidePromise;
}

const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim().replace(/'/g, '"');

/** Run one expression in an isolated namespace so tests don't poison each other. */
async function runExpr(code: string, expression: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const py = await loadPyodide();
  const lines: string[] = [];
  const errs: string[] = [];
  py.setStdout({ batched: (s: string) => lines.push(s) });
  py.setStderr({ batched: (s: string) => errs.push(s) });
  try {
    // Fresh dict per test — learner globals from prior tests cannot leak.
    py.globals.set('_chal_code', code);
    py.globals.set('_chal_expr', expression);
    await py.runPythonAsync(`
_ns = {}
exec(_chal_code, _ns)
print(eval(_chal_expr, _ns))
del _ns
`);
    return { ok: true, stdout: lines.join('\n'), stderr: errs.join('\n') };
  } catch (e: any) {
    const msg = String(e?.message || e);
    const last = msg.trim().split('\n').filter(Boolean).pop() || msg;
    return { ok: false, stdout: lines.join('\n'), stderr: last };
  }
}

/** Grade Python challenges entirely in the browser. */
export async function gradeWithPyodide(
  code: string,
  tests: ChallengeTest[],
  onStatus?: (msg: string) => void,
): Promise<GradeResult> {
  const unsub = onStatus ? onPyodideStatus(onStatus) : () => {};
  const results: TestResult[] = [];
  let error: string | undefined;

  try {
    await loadPyodide();
  } catch {
    unsub();
    return {
      supported: false,
      passed: 0,
      total: tests.length,
      allPass: false,
      results: [],
      error: 'Could not load Python in the browser (Pyodide).',
    };
  }

  onStatus?.('Running tests…');
  for (const t of tests) {
    const r = await runExpr(code, t.expression);
    if (!r.ok && !r.stdout.trim()) {
      if (!error) error = r.stderr || 'Your code raised an error.';
      results.push({
        expression: t.expression,
        expected: t.expected,
        actual: '(error)',
        pass: false,
      });
      continue;
    }
    const actual = r.stdout.trim();
    results.push({
      expression: t.expression,
      expected: t.expected,
      actual,
      pass: normalize(actual) === normalize(t.expected),
    });
  }

  unsub();
  onStatus?.('');
  const passed = results.filter((r) => r.pass).length;
  return {
    supported: true,
    passed,
    total: tests.length,
    allPass: tests.length > 0 && passed === tests.length,
    results,
    error,
  };
}

export function isPythonLang(language: string): boolean {
  return ['py', 'python', 'python3'].includes(language.toLowerCase());
}

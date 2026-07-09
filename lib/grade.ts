// Challenge grading (LEAP 3). Runs the learner's code against each test by
// evaluating the test expression and comparing its printed result to `expected`.
// Server-side; reuses lib/runner.ts, so it grounds on the same real runtimes
// (local node/python3, or Judge0). Language-agnostic: we just wrap the
// expression in a print/console.log and compare trimmed stdout.

import { ChallengeTest } from './types';
import { runCode } from './runner';

export interface TestResult {
  expression: string;
  expected: string;
  actual: string;
  pass: boolean;
}

export interface GradeResult {
  supported: boolean;
  passed: number;
  total: number;
  allPass: boolean;
  results: TestResult[];
  /** First compile/runtime error, if the code didn't even run. */
  error?: string;
}

function wrap(language: string, code: string, expression: string): string {
  const l = language.toLowerCase();
  if (['py', 'python', 'python3'].includes(l)) {
    return `${code}\n\nprint(${expression})\n`;
  }
  // js/ts and everything else console.log-able
  return `${code}\n\nconsole.log(${expression});\n`;
}

const normalize = (s: string) =>
  s.replace(/\r\n/g, '\n').trim().replace(/'/g, '"'); // tolerate quote style

export async function gradeChallenge(
  language: string,
  code: string,
  tests: ChallengeTest[],
): Promise<GradeResult> {
  const results: TestResult[] = [];
  let supported = true;
  let error: string | undefined;

  for (const t of tests) {
    const r = await runCode(language, wrap(language, code, t.expression));
    if (!r.supported) { supported = false; break; }
    const actual = r.stdout.trim();
    if (!r.ok && !actual) {
      // the code errored before producing output — surface it once
      if (!error) error = r.stderr.split('\n').filter(Boolean).pop() || 'Your code raised an error.';
      results.push({ expression: t.expression, expected: t.expected, actual: '(error)', pass: false });
      continue;
    }
    results.push({
      expression: t.expression,
      expected: t.expected,
      actual,
      pass: normalize(actual) === normalize(t.expected),
    });
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    supported,
    passed,
    total: tests.length,
    allPass: supported && tests.length > 0 && passed === tests.length,
    results,
    error,
  };
}

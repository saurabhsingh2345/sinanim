// Line-level diff for `diff` scenes. Classic LCS on lines — tutorial snippets
// are tiny, so O(n·m) is fine. The renderer and the pacer both consume this so
// the animation phases and the scene duration always agree.

export type DiffKind = 'kept' | 'removed' | 'added';

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.length ? before.split('\n') : [];
  const b = after.length ? after.split('\n') : [];
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = LCS length of a[i..] vs b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'kept', text: a[i] });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i] });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'removed', text: a[i++] });
  while (j < m) out.push({ kind: 'added', text: b[j++] });
  return out;
}

/** The added lines joined back together — this is what gets "typed". */
export function addedText(lines: DiffLine[]): string {
  return lines.filter((l) => l.kind === 'added').map((l) => l.text).join('\n');
}

// ── Animation phases (seconds, relative to scene start) ────────────────────────
/** Phase 1: the old code sits on screen with removals tinted red. */
export function diffHold(lines: { kind: DiffKind }[]): number {
  return lines.some((l) => l.kind === 'removed') ? 1.2 : 0.4;
}
/** Phase 2: removed lines collapse away. */
export const DIFF_COLLAPSE = 0.45;
/** When typing of added lines begins. */
export function diffTypeStart(lines: { kind: DiffKind }[]): number {
  return diffHold(lines) + (lines.some((l) => l.kind === 'removed') ? DIFF_COLLAPSE : 0);
}

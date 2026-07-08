// Token morphing — the Magic Move replacement for the old typewriter.
//
// A code state change is expressed as three kinds of tokens:
//   kept   — present in both states; SLIDES from its old (row,col) to its new one
//   remove — only in the old state; fades out where it was
//   add    — only in the new state; lands line-by-line with a soft rise
//
// A plain `code` scene is just a morph from the empty state (everything `add`),
// so first appearances and edits share one animation system. All timing is a
// pure function of the line diff, so the pacer (lib/dsl.ts) and the renderer
// agree exactly without tokenizing twice.

import { DiffLine, diffLines } from './diff';
import { Tok } from './highlight';
import { clamp } from './utils';

export type MorphKind = 'kept' | 'add' | 'remove';

export interface MorphToken {
  text: string;
  color: string;
  kind: MorphKind;
  /** Position in the BEFORE grid (kept/remove). */
  fromRow: number;
  fromCol: number;
  /** Position in the AFTER grid (kept/add). */
  toRow: number;
  toCol: number;
}

export interface MorphTiming {
  /** Old state sits untouched (readers see what's about to change). */
  hold: number;
  /** Kept tokens slide + removed tokens fade over [moveStart, moveEnd]. */
  moveStart: number;
  moveEnd: number;
  /** First added line lands here. */
  addStart: number;
  /** Stagger between added lines. */
  step: number;
  /** Per-line fade/rise window. */
  lineReveal: number;
  /** Content time; the scene should outlast this. */
  total: number;
}

export interface MorphPlan {
  tokens: MorphToken[];
  beforeRows: number;
  afterRows: number;
  /** AFTER-grid rows that contain added lines, ascending (reveal order). */
  addedRows: number[];
  /** BEFORE-grid rows that get removed (red-tinted during the hold). */
  removedRows: number[];
  /** First appearance: no befores, everything lands. */
  pureAdd: boolean;
  timing: MorphTiming;
}

// ── Timing (line-count based — usable before tokenization) ─────────────────────
export function morphTiming(lines: DiffLine[]): MorphTiming {
  const added = lines.filter((l) => l.kind === 'added').length;
  const removed = lines.filter((l) => l.kind === 'removed').length;
  const kept = lines.length - added - removed;

  if (kept === 0 && removed === 0) {
    // first appearance: lines cascade in, whole block readable in ~2-3s
    const step = clamp(2.4 / Math.max(added, 1), 0.07, 0.24);
    const addStart = 0.35;
    return {
      hold: 0,
      moveStart: 0,
      moveEnd: 0.01,
      addStart,
      step,
      lineReveal: 0.34,
      total: addStart + step * Math.max(0, added - 1) + 0.34 + 0.45,
    };
  }

  const hold = removed > 0 ? 0.7 : 0.45;
  const moveStart = hold;
  const moveEnd = hold + 0.65;
  const addStart = hold + 0.4;
  const step = clamp(2.2 / Math.max(added, 1), 0.08, 0.3);
  const lastAdd = added > 0 ? addStart + step * (added - 1) + 0.34 : moveEnd;
  return {
    hold,
    moveStart,
    moveEnd,
    addStart,
    step,
    lineReveal: 0.34,
    total: Math.max(moveEnd, lastAdd) + 0.45,
  };
}

/** When (scene-relative) the i-th added row begins landing. */
export function addRowAt(t: MorphTiming, order: number): number {
  return t.addStart + order * t.step;
}

/** Visible row count at `local` seconds (drives the panel height tween). */
export function visibleRows(plan: MorphPlan, local: number): number {
  if (plan.pureAdd) return plan.afterRows;
  const T = plan.timing;
  const p = clamp((local - T.moveStart) / Math.max(T.moveEnd - T.moveStart, 0.01), 0, 1);
  return plan.beforeRows + (plan.afterRows - plan.beforeRows) * p;
}

// ── Token matching ──────────────────────────────────────────────────────────────
interface Unit {
  text: string;
  col: number;
  color: string;
}

/** Split a line's Shiki tokens into word/symbol units (whitespace only advances the column). */
function lineUnits(toks: Tok[]): Unit[] {
  const units: Unit[] = [];
  let col = 0;
  for (const t of toks) {
    const parts = t.text.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]+/g) || [];
    for (const p of parts) {
      if (!/^\s+$/.test(p)) units.push({ text: p, col, color: t.color });
      col += p.length;
    }
  }
  return units;
}

interface Placed extends Unit {
  row: number;
}

/** Order-preserving LCS match between two unit sequences (equality on text). */
function matchUnits(a: Placed[], b: Placed[]): { ai: number; bi: number }[] {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];
  // lcs[i][j] = LCS of a[i..] vs b[j..]
  const lcs: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i].text === b[j].text
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const pairs: { ai: number; bi: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].text === b[j].text) {
      pairs.push({ ai: i, bi: j });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

// ── Plan builder ────────────────────────────────────────────────────────────────
export function buildMorph(
  before: string,
  after: string,
  beforeToks: Tok[][],
  afterToks: Tok[][],
): MorphPlan {
  const lines = diffLines(before, after);
  const timing = morphTiming(lines);
  const tokens: MorphToken[] = [];
  const addedRows: number[] = [];
  const removedRows: number[] = [];

  let bi = 0; // BEFORE row cursor
  let ai = 0; // AFTER row cursor
  let block: { removed: number[]; added: number[] } | null = null;

  const flushBlock = () => {
    if (!block) return;
    const bUnits: Placed[] = block.removed.flatMap((row) =>
      lineUnits(beforeToks[row] || []).map((u) => ({ ...u, row })),
    );
    const aUnits: Placed[] = block.added.flatMap((row) =>
      lineUnits(afterToks[row] || []).map((u) => ({ ...u, row })),
    );
    const pairs = matchUnits(bUnits, aUnits);
    const bMatched = new Set(pairs.map((p) => p.ai));
    const aMatched = new Set(pairs.map((p) => p.bi));

    for (const { ai: x, bi: y } of pairs) {
      tokens.push({
        text: aUnits[y].text,
        color: aUnits[y].color,
        kind: 'kept',
        fromRow: bUnits[x].row,
        fromCol: bUnits[x].col,
        toRow: aUnits[y].row,
        toCol: aUnits[y].col,
      });
    }
    bUnits.forEach((u, x) => {
      if (bMatched.has(x)) return;
      tokens.push({ text: u.text, color: u.color, kind: 'remove', fromRow: u.row, fromCol: u.col, toRow: 0, toCol: 0 });
    });
    aUnits.forEach((u, y) => {
      if (aMatched.has(y)) return;
      tokens.push({ text: u.text, color: u.color, kind: 'add', fromRow: 0, fromCol: 0, toRow: u.row, toCol: u.col });
    });
    block = null;
  };

  for (const l of lines) {
    if (l.kind === 'kept') {
      flushBlock();
      for (const u of lineUnits(afterToks[ai] || [])) {
        tokens.push({
          text: u.text,
          color: u.color,
          kind: 'kept',
          fromRow: bi,
          fromCol: u.col,
          toRow: ai,
          toCol: u.col,
        });
      }
      bi++; ai++;
    } else if (l.kind === 'removed') {
      block = block || { removed: [], added: [] };
      block.removed.push(bi);
      removedRows.push(bi);
      bi++;
    } else {
      block = block || { removed: [], added: [] };
      block.added.push(ai);
      addedRows.push(ai);
      ai++;
    }
  }
  flushBlock();

  return {
    tokens,
    beforeRows: bi,
    afterRows: ai,
    addedRows,
    removedRows,
    pureAdd: removedRows.length === 0 && addedRows.length === ai && ai > 0,
    timing,
  };
}

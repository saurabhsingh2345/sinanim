// ANSI SGR parsing — real terminal output, real colors.
//
// Output recorded from actual commands (scripts/record-terminal.mts) carries
// escape sequences: green checkmarks, red errors, cyan URLs, the lot. The
// canvas terminal draws those colors instead of a single tint, which is most
// of what makes VHS/asciinema output feel authentic. Only SGR (color/weight)
// is honored; cursor-movement and other control sequences are stripped.

export interface AnsiSeg {
  text: string;
  /** Resolved hex color, or null for the terminal's default tint. */
  color: string | null;
}

/** One-dark-ish 16-color palette (normal 0-7, bright 8-15). */
const PALETTE = [
  '#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d7dae0',
  '#4f5666', '#ff7a85', '#a9dc76', '#f0d197', '#74bfff', '#dd8ae8', '#6bd8e8', '#eceff4',
];

function xterm256(n: number): string {
  if (n < 16) return PALETTE[n];
  if (n < 232) {
    const lvl = [0, 95, 135, 175, 215, 255];
    const i = n - 16;
    const r = lvl[Math.floor(i / 36)], g = lvl[Math.floor(i / 6) % 6], b = lvl[i % 6];
    return `rgb(${r},${g},${b})`;
  }
  const v = 8 + 10 * (n - 232);
  return `rgb(${v},${v},${v})`;
}

/** Matches SGR (kept for parsing) and every other CSI/OSC sequence (stripped). */
const ANSI_RE = /\x1b\[([0-9;]*)m|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[\[()][0-9;?]*[a-zA-Z]|\x1b./g;

/** Plain text with all escape sequences removed. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

/**
 * Parse into plain text + a per-character color array (null = default tint).
 * The color state is carried across newlines, exactly like a real terminal.
 */
export function parseAnsi(s: string): { plain: string; colors: (string | null)[] } {
  let plain = '';
  const colors: (string | null)[] = [];
  let color: string | null = null;
  let bold = false;
  let last = 0;

  ANSI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANSI_RE.exec(s))) {
    const chunk = s.slice(last, m.index);
    for (const ch of chunk) { plain += ch; colors.push(color); }
    last = m.index + m[0].length;

    if (m[1] === undefined) continue; // non-SGR sequence: stripped, no state change
    const codes = m[1] === '' ? [0] : m[1].split(';').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) { color = null; bold = false; }
      else if (c === 1) { bold = true; if (color) { const idx = PALETTE.indexOf(color); if (idx >= 0 && idx < 8) color = PALETTE[idx + 8]; } }
      else if (c === 22) bold = false;
      else if (c === 39) color = null;
      else if (c >= 30 && c <= 37) color = PALETTE[c - 30 + (bold ? 8 : 0)];
      else if (c >= 90 && c <= 97) color = PALETTE[c - 90 + 8];
      else if (c === 38 && codes[i + 1] === 5) { color = xterm256(codes[i + 2] ?? 7); i += 2; }
      else if (c === 38 && codes[i + 1] === 2) { color = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`; i += 4; }
      // background (40-47, 48;...) and other attributes: ignored on canvas
      else if (c === 48 && codes[i + 1] === 5) i += 2;
      else if (c === 48 && codes[i + 1] === 2) i += 4;
    }
  }
  for (const ch of s.slice(last)) { plain += ch; colors.push(color); }
  return { plain, colors };
}

/** Parse into lines of color-run segments (for segment-based drawers). */
export function ansiToLines(s: string): AnsiSeg[][] {
  const { plain, colors } = parseAnsi(s);
  const lines: AnsiSeg[][] = [];
  let segs: AnsiSeg[] = [];
  let cur: AnsiSeg | null = null;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    if (ch === '\n') { if (cur) segs.push(cur); lines.push(segs); segs = []; cur = null; continue; }
    if (cur && cur.color === colors[i]) cur.text += ch;
    else { if (cur) segs.push(cur); cur = { text: ch, color: colors[i] }; }
  }
  if (cur) segs.push(cur);
  lines.push(segs);
  return lines;
}

/** True when the string contains any escape sequence worth parsing. */
export function hasAnsi(s: string): boolean {
  return s.includes('\x1b');
}

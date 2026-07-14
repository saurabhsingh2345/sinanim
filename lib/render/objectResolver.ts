// Turn an authored object word into a real hand-drawable SVG — with ZERO AI cost.
// A whiteboard "object" can name a concept ("server", "money", "idea", "git
// branch") instead of an exact filename; this resolver maps it to a file in
// public/objects via the generated manifest (handmade set + Tabler icons),
// using exact name → alias table → singular/plural → fuzzy token match, then a
// null fallback (the renderer draws a placeholder box). Pure + synchronous once
// the manifest is loaded, so it runs the same in Node and the browser.
export interface ObjManifest {
  aliases: Record<string, string>;
  objects: { name: string; file: string; source: string }[];
  /** name → file, built once; handmade wins over Tabler on name clash. */
  byName: Map<string, string>;
}

const EMPTY: ObjManifest = { aliases: {}, objects: [], byName: new Map() };

export function indexManifest(raw: { aliases?: Record<string, string>; objects?: { name: string; file: string; source: string }[] }): ObjManifest {
  const objects = raw.objects ?? [];
  const byName = new Map<string, string>();
  for (const o of objects) if (!byName.has(o.name)) byName.set(o.name, o.file); // first (handmade) wins
  return { aliases: raw.aliases ?? {}, objects, byName };
}

function norm(src: string): string {
  return src.toLowerCase().trim()
    .replace(/^\/?objects\//, '').replace(/^tabler\//, '')
    .replace(/\.svg$/, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function fuzzy(n: string, m: ObjManifest): string | null {
  const nTokens = n.split('-').filter(Boolean);
  let best: string | null = null, bestScore = 14; // threshold: need a real overlap
  for (const o of m.objects) {
    const name = o.name;
    let score = 0;
    const shorter = Math.min(name.length, n.length);
    if ((name.startsWith(n) || n.startsWith(name)) && shorter >= 3) score += 40;
    else if ((name.includes(n) && n.length >= 4) || (n.includes(name) && name.length >= 4)) score += 25;
    if (score < 40) {
      const tokens = name.split('-');
      for (const t of nTokens) if (t.length >= 3 && tokens.includes(t)) score += 16;
    }
    // prefer shorter names on ties (a plain "server" over "server-cog")
    if (score > bestScore || (score === bestScore && best && name.length < best.length)) { bestScore = score; best = name; }
  }
  return best ? (m.byName.get(best) ?? null) : null;
}

/** Resolve an authored `src` to a file path relative to public/objects (e.g.
 *  'database.svg' or 'tabler/server.svg'), or null when nothing sensible matches. */
export function resolveObjectFile(src: string, m: ObjManifest): string | null {
  if (!src) return null;
  const n = norm(src);
  if (m.byName.has(n)) return m.byName.get(n)!;
  const alias = m.aliases[n];
  if (alias && m.byName.has(norm(alias))) return m.byName.get(norm(alias))!;
  // singular/plural nudge
  const alt = n.endsWith('s') ? n.slice(0, -1) : `${n}s`;
  if (m.byName.has(alt)) return m.byName.get(alt)!;
  return fuzzy(n, m);
}

// ── manifest loading (cached; works in Node and the browser) ─────────────────────
let cache: ObjManifest | null = null;
let inflight: Promise<ObjManifest> | null = null;

export async function loadObjectManifest(): Promise<ObjManifest> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      let raw: any;
      if (typeof window !== 'undefined') {
        const r = await fetch('/objects/manifest.json');
        raw = r.ok ? await r.json() : {};
      } else {
        const fs: any = await import(/* webpackIgnore: true */ 'node:fs');
        const path: any = await import(/* webpackIgnore: true */ 'node:path');
        const p = path.join(process.cwd(), 'public', 'objects', 'manifest.json');
        raw = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
      }
      cache = indexManifest(raw);
    } catch {
      cache = EMPTY;
    }
    return cache!;
  })();
  return inflight;
}

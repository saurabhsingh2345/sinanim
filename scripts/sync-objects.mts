// Populate public/objects/tabler/ from the @tabler/icons package (MIT, ~5k
// line-art SVGs) and (re)generate public/objects/manifest.json — the catalog the
// whiteboard object-resolver reads to turn a concept word ("server", "money",
// "idea") into a real hand-drawable icon, with zero AI cost.
//
//   npm run sync:objects            # curated core (~committed set)
//   npm run sync:objects -- --full  # every Tabler outline icon (build step)
//
// Each Tabler file carries an invisible 24×24 bounding-box <path> we must strip,
// or the renderer would draw a square around every icon. viewBox is preserved so
// lib/render/svg.ts scales it correctly.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TABLER_SRC = join(ROOT, 'node_modules/@tabler/icons/icons/outline');
const OBJ_DIR = join(ROOT, 'public/objects');
const OUT_DIR = join(OBJ_DIR, 'tabler');
const FULL = process.argv.includes('--full');

// Curated core — committed to git so dev has real icons without a sync. Names are
// Tabler outline filenames (без .svg). Missing names are skipped with a warning.
const CORE = [
  // people / actors
  'user', 'users', 'users-group', 'user-plus', 'user-check', 'mood-smile', 'friends',
  // dev / code
  'code', 'braces', 'brackets', 'terminal', 'terminal-2', 'bug', 'git-branch',
  'git-commit', 'git-merge', 'git-pull-request', 'binary', 'variable', 'function',
  'hash', 'api', 'webhook', 'stack', 'stack-2', 'command',
  // infra / web
  'server', 'server-2', 'database', 'cloud', 'world', 'world-www', 'network',
  'wifi', 'router', 'plug', 'link', 'browser', 'devices', 'device-laptop',
  'device-desktop', 'device-mobile', 'cpu', 'topology-star',
  // ideas / learning
  'bulb', 'brain', 'book', 'books', 'school', 'notes', 'note', 'pencil', 'writing',
  'bookmark', 'certificate', 'atom', 'flask', 'microscope', 'robot', 'puzzle',
  // files / data
  'file', 'file-text', 'files', 'folder', 'folder-open', 'clipboard', 'copy',
  'table', 'list', 'list-check', 'layout-grid', 'columns',
  // charts / money
  'chart-bar', 'chart-line', 'chart-pie', 'chart-dots', 'trending-up',
  'trending-down', 'coin', 'currency-dollar', 'cash', 'credit-card', 'wallet',
  'shopping-cart', 'package', 'box', 'boxes',
  // flow / arrows / marks
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'arrows-exchange',
  'refresh', 'reload', 'rotate', 'check', 'circle-check', 'x', 'circle-x',
  'alert-triangle', 'alert-circle', 'info-circle', 'help-circle', 'question-mark',
  // security
  'lock', 'lock-open', 'key', 'shield', 'shield-check', 'shield-lock', 'fingerprint',
  // comms
  'mail', 'message', 'message-circle', 'messages', 'bell', 'phone', 'send',
  // time / targets
  'clock', 'hourglass', 'calendar', 'target', 'focus-2', 'flag', 'map-pin', 'map',
  // ui / tools
  'settings', 'adjustments', 'tool', 'tools', 'search', 'zoom-in', 'filter',
  'eye', 'eye-off', 'star', 'heart', 'thumb-up', 'trash', 'edit', 'plus', 'minus',
  // misc concept
  'rocket', 'bolt', 'flame', 'droplet', 'bulb-off', 'building', 'home', 'tag',
  'tags', 'id', 'trophy', 'gift', 'lifebuoy', 'compass', 'route', 'sitemap',
  // science / nature / physics / math (common explainer nouns)
  'sun', 'moon', 'star', 'planet', 'atom', 'atom-2', 'engine', 'magnet', 'wind',
  'temperature', 'thermometer', 'snowflake', 'mountain', 'plant', 'plant-2',
  'seeding', 'leaf', 'tree', 'dna', 'dna-2', 'flask-2', 'test-pipe', 'ph',
  'gauge', 'scale', 'ruler', 'ruler-2', 'calculator', 'math', 'math-symbols',
  'wave-sine', 'wave-square', 'battery', 'bulb', 'apple', 'ball-football',
  'car', 'plane', 'ship', 'walk', 'run', 'clock-hour-4', 'calendar-event',
  'building-bank', 'scale-outline', 'balloon', 'bucket', 'droplet-half',
];

// Concept synonyms → a real object name (a Tabler filename or a handmade .svg).
// The resolver falls back to fuzzy matching, but these nail the common words.
const ALIASES: Record<string, string> = {
  you: 'user', me: 'user', person: 'user', learner: 'user', developer: 'user',
  human: 'user', account: 'user', profile: 'user', people: 'users', team: 'users-group',
  idea: 'bulb', lightbulb: 'bulb', insight: 'bulb', ai: 'robot', ml: 'brain',
  'machine-learning': 'brain', neural: 'brain', model: 'brain',
  laptop: 'device-laptop', computer: 'device-desktop', pc: 'device-desktop',
  phone: 'device-mobile', mobile: 'device-mobile', app: 'device-mobile',
  internet: 'world', web: 'world-www', website: 'browser', site: 'browser',
  db: 'database', datastore: 'database', storage: 'database', sql: 'database',
  backend: 'server', service: 'server', host: 'server', vm: 'server',
  money: 'coin', cash: 'cash', dollar: 'currency-dollar', price: 'currency-dollar',
  cost: 'coin', payment: 'credit-card', pay: 'credit-card',
  time: 'clock', timer: 'hourglass', wait: 'hourglass', schedule: 'calendar',
  graph: 'chart-line', chart: 'chart-bar', analytics: 'chart-dots', metrics: 'chart-bar',
  growth: 'trending-up', increase: 'trending-up', decrease: 'trending-down',
  secure: 'shield-check', security: 'shield', auth: 'lock', password: 'key',
  token: 'key', encrypt: 'lock', firewall: 'shield',
  email: 'mail', chat: 'message-circle', notification: 'bell', alert: 'alert-triangle',
  warning: 'alert-triangle', error: 'circle-x', success: 'circle-check', ok: 'check',
  correct: 'circle-check', wrong: 'circle-x', done: 'circle-check',
  goal: 'target', aim: 'target', destination: 'map-pin', location: 'map-pin',
  fast: 'rocket', speed: 'rocket', launch: 'rocket', deploy: 'rocket', power: 'bolt',
  energy: 'bolt', hot: 'flame', water: 'droplet', data: 'database',
  question: 'question-mark', unknown: 'question-mark', info: 'info-circle',
  search: 'search', find: 'search', lookup: 'search', explore: 'compass',
  settings: 'settings', config: 'settings', build: 'tools', fix: 'tool',
  document: 'file-text', doc: 'file-text', page: 'file', report: 'file-text',
  code: 'code', function: 'function', variable: 'variable', array: 'brackets',
  object: 'braces', loop: 'refresh', repeat: 'refresh', sync: 'refresh',
  request: 'arrow-right', response: 'arrow-left', exchange: 'arrows-exchange',
  student: 'school', teacher: 'school', course: 'certificate', lesson: 'book',
  package: 'package', module: 'package', library: 'books', dependency: 'package',
  cloud: 'cloud', upload: 'arrow-up', download: 'arrow-down', connect: 'link',
  star: 'star', favorite: 'heart', like: 'thumb-up', win: 'trophy', reward: 'gift',
};

function stripBBox(svg: string): string {
  // Drop the invisible bounding-box path(s): any <path> with stroke="none".
  return svg.replace(/<path\b[^>]*\bstroke\s*=\s*"none"[^>]*\/?>/gi, '').replace(/\n\s*\n/g, '\n');
}

function pick(): string[] {
  const all = readdirSync(TABLER_SRC).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, ''));
  if (FULL) return all;
  const set = new Set(all);
  return CORE.filter((n) => set.has(n));
}

function handmade(): string[] {
  return readdirSync(OBJ_DIR).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, ''));
}

function main() {
  if (!existsSync(TABLER_SRC)) {
    console.error('Missing @tabler/icons — run `npm install` first.');
    process.exit(1);
  }
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const names = pick();
  let written = 0, missing = 0;
  for (const name of names) {
    const src = join(TABLER_SRC, `${name}.svg`);
    if (!existsSync(src)) { missing++; continue; }
    writeFileSync(join(OUT_DIR, `${name}.svg`), stripBBox(readFileSync(src, 'utf8')));
    written++;
  }

  // Manifest: handmade objects first (priority overrides), then Tabler set. Each
  // entry: { name, file, source }. Aliases live once, keyed by synonym.
  const hand = handmade();
  const objects = [
    ...hand.map((n) => ({ name: n, file: `${n}.svg`, source: 'handmade' })),
    ...names.filter((n) => existsSync(join(OUT_DIR, `${n}.svg`))).map((n) => ({ name: n, file: `tabler/${n}.svg`, source: 'tabler' })),
  ];
  const manifest = { generated: '@tabler/icons v3.44 (MIT) + handmade', mode: FULL ? 'full' : 'core', count: objects.length, aliases: ALIASES, objects };
  writeFileSync(join(OBJ_DIR, 'manifest.json'), JSON.stringify(manifest, null, FULL ? 0 : 2));

  console.log(`objects: ${written} tabler (${FULL ? 'full' : 'core'}) + ${hand.length} handmade = ${objects.length}; ${missing} core names not in Tabler; manifest written.`);
}

main();

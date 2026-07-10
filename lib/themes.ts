// Named visual systems for course scenes. Inspired by code2mp4 "motion systems":
// each pack is a deterministic palette + Shiki theme id the renderer can apply.

export interface IdeChrome {
  bg: string;
  title: string;
  activity: string;
  side: string;
  rowActive: string;
  tabbar: string;
  tabInactive: string;
  line: string;
  text: string;
  active: string;
  dim: string;
  termBg: string;
  termHdr: string;
  termGreen: string;
  termCyan: string;
  termRed: string;
  termOut: string;
}

export interface BrowserChrome {
  bg: string;
  fg: string;
  dim: string;
  card: string;
  border: string;
  accent: string;
  navBg?: string;
}

export interface CliChrome {
  bg: string;
  prompt: string;
  stdout: string;
  stderr: string;
  cwd: string;
}

export interface PanelChrome {
  panel: string;
  panelTop: string;
  border: string;
  borderTop: string;
  sep: string;
  text: string;
  dim: string;
  faint: string;
  terminal: string;
  prompt: string;
  accent: string;
  accentDeep: string;
  green: string;
  red: string;
  trafficRed: string;
  trafficYellow: string;
  trafficGreen: string;
}

export interface ThemePack {
  id: string;
  label: string;
  /** Canvas backdrop fill. */
  background: string;
  accent: string;
  /** Soft blob tints for drawBackdrop (rgba strings). */
  blobA: string;
  blobB: string;
  /** Shiki theme id for syntax highlighting. */
  shiki: string;
  panel: PanelChrome;
  ide: IdeChrome;
  browserLight: BrowserChrome;
  browserDark: BrowserChrome;
  cli: CliChrome;
}

export type ThemeInput = string | Partial<ThemePack> | undefined;

const TRAFFIC = {
  trafficRed: '#ff5f57',
  trafficYellow: '#febc2e',
  trafficGreen: '#28c840',
};

export const THEME_PACKS: Record<string, ThemePack> = {
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    background: '#0b0b10',
    accent: '#a78bfa',
    blobA: 'rgba(139,92,246,0.075)',
    blobB: 'rgba(56,89,235,0.055)',
    shiki: 'one-dark-pro',
    panel: {
      panel: '#16161d',
      panelTop: 'rgba(255,255,255,0.035)',
      border: 'rgba(255,255,255,0.09)',
      borderTop: 'rgba(255,255,255,0.14)',
      sep: 'rgba(255,255,255,0.06)',
      text: '#ecebf2',
      dim: '#8b8a97',
      faint: 'rgba(255,255,255,0.28)',
      terminal: '#7ee2a8',
      prompt: '#6b7280',
      accent: '#a78bfa',
      accentDeep: '#8b5cf6',
      green: '#34d399',
      red: '#f87171',
      ...TRAFFIC,
    },
    ide: {
      bg: '#1e1e1e',
      title: '#3c3c3c',
      activity: '#2c2c2c',
      side: '#252526',
      rowActive: 'rgba(255,255,255,0.06)',
      tabbar: '#252526',
      tabInactive: '#2d2d2d',
      line: '#1a1a1a',
      text: '#cfcfd4',
      active: '#ffffff',
      dim: '#7f7f88',
      termBg: '#181818',
      termHdr: '#252526',
      termGreen: '#7ee2a8',
      termCyan: '#56b6c2',
      termRed: '#f87171',
      termOut: '#c9c9cf',
    },
    browserLight: {
      bg: '#ffffff', fg: '#1a1a2e', dim: '#6b7280', card: '#f6f7fb', border: '#e5e7eb', accent: '#7c3aed',
    },
    browserDark: {
      bg: '#0f1117', fg: '#e8e8f0', dim: '#9aa0b4', card: '#181b24', border: '#262a36', accent: '#a78bfa',
    },
    cli: { bg: '#0d0d12', prompt: '#6b7280', stdout: '#c9c9cf', stderr: '#f87171', cwd: '#7ee2a8' },
  },

  nord: {
    id: 'nord',
    label: 'Nord',
    background: '#2e3440',
    accent: '#88c0d0',
    blobA: 'rgba(136,192,208,0.08)',
    blobB: 'rgba(94,129,172,0.06)',
    shiki: 'nord',
    panel: {
      panel: '#3b4252',
      panelTop: 'rgba(236,239,244,0.04)',
      border: 'rgba(236,239,244,0.1)',
      borderTop: 'rgba(236,239,244,0.16)',
      sep: 'rgba(236,239,244,0.06)',
      text: '#eceff4',
      dim: '#a3b1c6',
      faint: 'rgba(236,239,244,0.3)',
      terminal: '#a3be8c',
      prompt: '#81a1c1',
      accent: '#88c0d0',
      accentDeep: '#5e81ac',
      green: '#a3be8c',
      red: '#bf616a',
      ...TRAFFIC,
    },
    ide: {
      bg: '#2e3440',
      title: '#3b4252',
      activity: '#232831',
      side: '#292e39',
      rowActive: 'rgba(136,192,208,0.12)',
      tabbar: '#292e39',
      tabInactive: '#3b4252',
      line: '#252a33',
      text: '#d8dee9',
      active: '#eceff4',
      dim: '#7b88a1',
      termBg: '#242933',
      termHdr: '#292e39',
      termGreen: '#a3be8c',
      termCyan: '#88c0d0',
      termRed: '#bf616a',
      termOut: '#d8dee9',
    },
    browserLight: {
      bg: '#eceff4', fg: '#2e3440', dim: '#4c566a', card: '#e5e9f0', border: '#d8dee9', accent: '#5e81ac',
    },
    browserDark: {
      bg: '#2e3440', fg: '#eceff4', dim: '#a3b1c6', card: '#3b4252', border: '#434c5e', accent: '#88c0d0',
    },
    cli: { bg: '#242933', prompt: '#81a1c1', stdout: '#d8dee9', stderr: '#bf616a', cwd: '#a3be8c' },
  },

  'github-light': {
    id: 'github-light',
    label: 'GitHub Light',
    background: '#f6f8fa',
    accent: '#0969da',
    blobA: 'rgba(9,105,218,0.06)',
    blobB: 'rgba(130,80,223,0.04)',
    shiki: 'github-light',
    panel: {
      panel: '#ffffff',
      panelTop: 'rgba(0,0,0,0.02)',
      border: 'rgba(0,0,0,0.1)',
      borderTop: 'rgba(0,0,0,0.14)',
      sep: 'rgba(0,0,0,0.06)',
      text: '#1f2328',
      dim: '#656d76',
      faint: 'rgba(0,0,0,0.28)',
      terminal: '#1a7f37',
      prompt: '#656d76',
      accent: '#0969da',
      accentDeep: '#0550ae',
      green: '#1a7f37',
      red: '#cf222e',
      ...TRAFFIC,
    },
    ide: {
      bg: '#ffffff',
      title: '#eaeef2',
      activity: '#f6f8fa',
      side: '#f6f8fa',
      rowActive: 'rgba(9,105,218,0.08)',
      tabbar: '#f6f8fa',
      tabInactive: '#eaeef2',
      line: '#f0f2f4',
      text: '#1f2328',
      active: '#000000',
      dim: '#656d76',
      termBg: '#f6f8fa',
      termHdr: '#eaeef2',
      termGreen: '#1a7f37',
      termCyan: '#0550ae',
      termRed: '#cf222e',
      termOut: '#1f2328',
    },
    browserLight: {
      bg: '#ffffff', fg: '#1f2328', dim: '#656d76', card: '#f6f8fa', border: '#d0d7de', accent: '#0969da',
    },
    browserDark: {
      bg: '#0d1117', fg: '#e6edf3', dim: '#8b949e', card: '#161b22', border: '#30363d', accent: '#2f81f7',
    },
    cli: { bg: '#f6f8fa', prompt: '#656d76', stdout: '#1f2328', stderr: '#cf222e', cwd: '#1a7f37' },
  },

  solarized: {
    id: 'solarized',
    label: 'Solarized Dark',
    background: '#002b36',
    accent: '#268bd2',
    blobA: 'rgba(38,139,210,0.08)',
    blobB: 'rgba(181,137,0,0.05)',
    shiki: 'solarized-dark',
    panel: {
      panel: '#073642',
      panelTop: 'rgba(253,246,227,0.03)',
      border: 'rgba(147,161,161,0.2)',
      borderTop: 'rgba(147,161,161,0.28)',
      sep: 'rgba(147,161,161,0.12)',
      text: '#fdf6e3',
      dim: '#839496',
      faint: 'rgba(253,246,227,0.28)',
      terminal: '#859900',
      prompt: '#586e75',
      accent: '#268bd2',
      accentDeep: '#2aa198',
      green: '#859900',
      red: '#dc322f',
      ...TRAFFIC,
    },
    ide: {
      bg: '#002b36',
      title: '#073642',
      activity: '#00212b',
      side: '#002b36',
      rowActive: 'rgba(38,139,210,0.15)',
      tabbar: '#073642',
      tabInactive: '#002b36',
      line: '#00212b',
      text: '#839496',
      active: '#fdf6e3',
      dim: '#586e75',
      termBg: '#00212b',
      termHdr: '#073642',
      termGreen: '#859900',
      termCyan: '#2aa198',
      termRed: '#dc322f',
      termOut: '#93a1a1',
    },
    browserLight: {
      bg: '#fdf6e3', fg: '#657b83', dim: '#93a1a1', card: '#eee8d5', border: '#93a1a1', accent: '#268bd2',
    },
    browserDark: {
      bg: '#002b36', fg: '#fdf6e3', dim: '#839496', card: '#073642', border: '#586e75', accent: '#268bd2',
    },
    cli: { bg: '#00212b', prompt: '#586e75', stdout: '#93a1a1', stderr: '#dc322f', cwd: '#859900' },
  },

  'warm-studio': {
    id: 'warm-studio',
    label: 'Warm Studio',
    background: '#1a1410',
    accent: '#f0a060',
    blobA: 'rgba(240,160,96,0.07)',
    blobB: 'rgba(200,80,60,0.05)',
    shiki: 'min-dark',
    panel: {
      panel: '#241c16',
      panelTop: 'rgba(255,220,180,0.04)',
      border: 'rgba(255,200,150,0.1)',
      borderTop: 'rgba(255,200,150,0.16)',
      sep: 'rgba(255,200,150,0.06)',
      text: '#f5ebe0',
      dim: '#a89080',
      faint: 'rgba(255,220,180,0.28)',
      terminal: '#90c070',
      prompt: '#8a7060',
      accent: '#f0a060',
      accentDeep: '#e07840',
      green: '#90c070',
      red: '#e07060',
      ...TRAFFIC,
    },
    ide: {
      bg: '#1e1814',
      title: '#2a221c',
      activity: '#181410',
      side: '#221c18',
      rowActive: 'rgba(240,160,96,0.12)',
      tabbar: '#221c18',
      tabInactive: '#2a221c',
      line: '#181410',
      text: '#d8c8b8',
      active: '#f5ebe0',
      dim: '#8a7060',
      termBg: '#161210',
      termHdr: '#221c18',
      termGreen: '#90c070',
      termCyan: '#70b0c0',
      termRed: '#e07060',
      termOut: '#d0c0b0',
    },
    browserLight: {
      bg: '#faf6f1', fg: '#2a221c', dim: '#8a7060', card: '#f0e8e0', border: '#e0d0c0', accent: '#c06030',
    },
    browserDark: {
      bg: '#1a1410', fg: '#f5ebe0', dim: '#a89080', card: '#241c16', border: '#3a3028', accent: '#f0a060',
    },
    cli: { bg: '#161210', prompt: '#8a7060', stdout: '#d0c0b0', stderr: '#e07060', cwd: '#90c070' },
  },

  'high-contrast': {
    id: 'high-contrast',
    label: 'High Contrast',
    background: '#000000',
    accent: '#ffff00',
    blobA: 'rgba(255,255,0,0.04)',
    blobB: 'rgba(0,255,255,0.03)',
    shiki: 'dark-plus',
    panel: {
      panel: '#0a0a0a',
      panelTop: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.35)',
      borderTop: 'rgba(255,255,255,0.5)',
      sep: 'rgba(255,255,255,0.2)',
      text: '#ffffff',
      dim: '#c0c0c0',
      faint: 'rgba(255,255,255,0.45)',
      terminal: '#00ff00',
      prompt: '#ffffff',
      accent: '#ffff00',
      accentDeep: '#ffcc00',
      green: '#00ff00',
      red: '#ff4444',
      ...TRAFFIC,
    },
    ide: {
      bg: '#000000',
      title: '#1a1a1a',
      activity: '#0a0a0a',
      side: '#0a0a0a',
      rowActive: 'rgba(255,255,0,0.15)',
      tabbar: '#0a0a0a',
      tabInactive: '#1a1a1a',
      line: '#050505',
      text: '#ffffff',
      active: '#ffff00',
      dim: '#a0a0a0',
      termBg: '#000000',
      termHdr: '#0a0a0a',
      termGreen: '#00ff00',
      termCyan: '#00ffff',
      termRed: '#ff4444',
      termOut: '#ffffff',
    },
    browserLight: {
      bg: '#ffffff', fg: '#000000', dim: '#333333', card: '#f0f0f0', border: '#000000', accent: '#0000ff',
    },
    browserDark: {
      bg: '#000000', fg: '#ffffff', dim: '#c0c0c0', card: '#111111', border: '#ffffff', accent: '#ffff00',
    },
    cli: { bg: '#000000', prompt: '#ffffff', stdout: '#ffffff', stderr: '#ff4444', cwd: '#00ff00' },
  },
};

export const DEFAULT_THEME_ID = 'midnight';
export const THEME_IDS = Object.keys(THEME_PACKS);

export interface BrandKit {
  name?: string;
  accent?: string;
  logoUrl?: string;
}

function deepMerge<T extends Record<string, any>>(base: T, over?: Partial<T>): T {
  if (!over) return { ...base };
  const out: any = { ...base };
  for (const k of Object.keys(over)) {
    const v = (over as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object') {
      out[k] = { ...base[k], ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/** Resolve a ThemePack from DSL/scene theme id, optional partial override, and brand accent. */
export function resolveTheme(
  dslTheme?: ThemeInput,
  sceneTheme?: ThemeInput,
  brand?: BrandKit,
  style?: Partial<ThemePack>,
): ThemePack {
  const pickId = (t: ThemeInput): string | null =>
    typeof t === 'string' && THEME_PACKS[t] ? t : null;

  const id =
    pickId(sceneTheme) ||
    pickId(dslTheme) ||
    (typeof sceneTheme === 'object' && sceneTheme?.id && THEME_PACKS[sceneTheme.id]
      ? sceneTheme.id
      : null) ||
    (typeof dslTheme === 'object' && dslTheme?.id && THEME_PACKS[dslTheme.id]
      ? dslTheme.id
      : null) ||
    DEFAULT_THEME_ID;

  let pack: ThemePack = { ...THEME_PACKS[id] };

  if (typeof dslTheme === 'object' && dslTheme) pack = deepMerge(pack, dslTheme);
  if (typeof sceneTheme === 'object' && sceneTheme) pack = deepMerge(pack, sceneTheme);
  if (style) pack = deepMerge(pack, style);

  if (brand?.accent) {
    pack = {
      ...pack,
      accent: brand.accent,
      panel: { ...pack.panel, accent: brand.accent, accentDeep: brand.accent },
      browserLight: { ...pack.browserLight, accent: brand.accent },
      browserDark: { ...pack.browserDark, accent: brand.accent },
    };
  }

  return pack;
}

export function listThemePacks(): { id: string; label: string }[] {
  return THEME_IDS.map((id) => ({ id, label: THEME_PACKS[id].label }));
}

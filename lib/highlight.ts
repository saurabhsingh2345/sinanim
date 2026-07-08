import {
  createHighlighter,
  type Highlighter,
  bundledLanguages,
} from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export interface Tok {
  text: string;
  color: string;
}

export const CODE_THEME = 'github-dark-default';

const PRELOAD = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'bash',
  'json',
  'html',
  'css',
];

let hlPromise: Promise<Highlighter> | null = null;
const loaded = new Set<string>(PRELOAD);

function getHighlighter(): Promise<Highlighter> {
  if (!hlPromise) {
    hlPromise = createHighlighter({
      themes: [CODE_THEME],
      langs: PRELOAD,
      engine: createJavaScriptRegexEngine(),
    });
  }
  return hlPromise;
}

function normalizeLang(lang: string): string {
  const l = (lang || 'text').toLowerCase();
  const alias: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    'c++': 'cpp',
    text: 'txt',
    plaintext: 'txt',
  };
  return alias[l] || l;
}

/** Tokenize code into lines of colored tokens for canvas drawing. */
export async function tokenizeCode(
  code: string,
  language: string,
): Promise<Tok[][]> {
  const hl = await getHighlighter();
  let lang = normalizeLang(language);

  if (lang !== 'txt' && !loaded.has(lang)) {
    if (lang in bundledLanguages) {
      try {
        await hl.loadLanguage(lang as keyof typeof bundledLanguages);
        loaded.add(lang);
      } catch {
        lang = 'txt';
      }
    } else {
      lang = 'txt';
    }
  }

  try {
    const { tokens } = hl.codeToTokens(code, {
      lang: lang === 'txt' ? 'text' : (lang as any),
      theme: CODE_THEME,
    });
    return tokens.map((line) =>
      line.map((t) => ({ text: t.content, color: t.color || '#e4e4e7' })),
    );
  } catch {
    // last-resort plain fallback
    return code.split('\n').map((line) => [{ text: line, color: '#e4e4e7' }]);
  }
}

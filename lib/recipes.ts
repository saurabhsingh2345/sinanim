// Curriculum recipes: ordered surface lists that turn a topic into a complete lesson.
// Used by the LLM prompt injector and by gold scaffolds / fast-path matching.

export type RecipeSurface =
  | 'title'
  | 'bullets'
  | 'ide'
  | 'cli'
  | 'browser'
  | 'split'
  | 'layout'
  | 'api'
  | 'pr'
  | 'viz'
  | 'diagram'
  | 'quiz'
  | 'challenge'
  | 'quote'
  | 'chapter';

export interface CurriculumRecipe {
  id: string;
  label: string;
  /** Match against user prompts (case-insensitive). */
  match: RegExp;
  surfaces: RecipeSurface[];
  pedagogy: string;
  /** Soft target scene count. */
  sceneBudget: { min: number; max: number };
}

export const RECIPES: CurriculumRecipe[] = [
  {
    id: 'python-basics',
    label: 'Python basics (IDE + viz + quiz + challenge)',
    match: /\b(python|for\s+loop|while\s+loop|loops?|list\s+comprehension|f-?string|decorator|generator)\b/i,
    surfaces: ['title', 'bullets', 'ide', 'viz', 'quiz', 'challenge', 'bullets'],
    pedagogy:
      'Open with motivation. Teach in the IDE with a real run step. Animate the idea with viz. Quiz, then a hands-on challenge. Close with a recap.',
    sceneBudget: { min: 7, max: 12 },
  },
  {
    id: 'web-api',
    label: 'Web / REST API',
    match: /\b(api|rest|http|flask|express|endpoint|postman|json\s+response|fetch)\b/i,
    surfaces: ['title', 'bullets', 'ide', 'api', 'quiz', 'bullets'],
    pedagogy:
      'Build or call an API in the IDE, show the request in an API card, quiz on status codes, recap.',
    sceneBudget: { min: 6, max: 12 },
  },
  {
    id: 'web-search-docs',
    label: 'Browser search → docs / download',
    match: /\b(look\s*up|search\s+(the\s+)?web|google|docs\.python|python\.org\/downloads|download\s+python|official\s+docs|find\s+.*docs)\b/i,
    surfaces: ['title', 'browser', 'browser', 'browser', 'quiz', 'bullets'],
    pedagogy:
      'Authored Chrome flow only (no live fetch): omnibox/search → SERP results → docs or downloads page. Narration must name what is on screen (query typed, result clicked, section highlighted).',
    sceneBudget: { min: 5, max: 10 },
  },
  {
    id: 'cli-tool',
    label: 'CLI / scaffold',
    match: /\b(cli|terminal|vite|npm\s+create|scaffold|shell|bash|zsh)\b/i,
    surfaces: ['title', 'cli', 'browser', 'bullets', 'quiz'],
    pedagogy:
      'Run real commands in the terminal, show the resulting app in the browser, explain each command, quiz.',
    sceneBudget: { min: 4, max: 10 },
  },
  {
    id: 'frontend-live',
    label: 'HTML/CSS live preview',
    match: /\b(html|css|dom|landing\s+page|frontend|react\s+component)\b/i,
    surfaces: ['title', 'split', 'quiz', 'bullets'],
    pedagogy: 'Type on the left, preview on the right, checkpoint quiz, recap.',
    sceneBudget: { min: 4, max: 10 },
  },
  {
    id: 'algo-viz',
    label: 'Algorithm / data structure',
    match: /\b(sort|search|recursi\w*|stack|queue|tree|linked\s+list|binary|pointer|hash|bfs|dfs|algorithm|big\s*o|two\s*pointer|sliding\s*window)\b/i,
    surfaces: ['title', 'bullets', 'viz', 'ide', 'quiz', 'challenge', 'bullets'],
    pedagogy:
      'Motivate, animate the idea with viz BEFORE or WITH the code, then IDE, quiz, challenge, recap.',
    sceneBudget: { min: 7, max: 14 },
  },
  {
    id: 'default-coding',
    label: 'Default coding lesson',
    match: /.*/,
    surfaces: ['title', 'bullets', 'ide', 'quiz', 'challenge', 'bullets'],
    pedagogy:
      'Title, goals, IDE walkthrough with a run step, quiz, optional challenge, recap. Prefer ide over bare code/terminal panels.',
    sceneBudget: { min: 6, max: 12 },
  },
];

/** Pick the best recipe for a free-text topic / prompt. */
export function matchRecipe(prompt: string): CurriculumRecipe {
  const p = prompt.trim();
  for (const r of RECIPES) {
    if (r.id === 'default-coding') continue;
    if (r.match.test(p)) return r;
  }
  return RECIPES.find((r) => r.id === 'default-coding')!;
}

/** Fast-path: if the prompt clearly asks for a gold curriculum pack. */
export function matchGoldTemplateId(prompt: string): string | null {
  const p = prompt.toLowerCase();
  if (
    /\b(for\s+and\s+while|while\s+and\s+for|python\s+loops?|loops?\s+in\s+python|teach\s+(me\s+)?loops?)\b/.test(p) ||
    /\b(python.{0,24}(for|while)\s*loops?|(for|while)\s+loops?\b|teach.{0,20}(for|while)\s*loops?)\b/.test(p) ||
    /\bpython\s+for\b/.test(p)
  ) {
    return 'python-loops';
  }
  if (/\bjs\s+array\s*\.?map|array\s*\.?map\b/.test(p)) return 'js-array-map';
  if (/\bgit\s+basics|first\s+commit\b/.test(p)) return 'git-basics';
  if (/\brest\s+crud|crud\s+api\b/.test(p)) return 'rest-crud';
  if (
    /\b(python\s+docs|docs\.python|look\s*up\s+python|find\s+python\s+(docs|downloads)|download\s+python|search\s+.*python\s+docs)\b/.test(p)
  ) {
    return 'web-python-docs';
  }
  return null;
}

/** Text block injected into the LLM user/system context. */
export function recipePromptBlock(recipe: CurriculumRecipe): string {
  return [
    `CURRICULUM RECIPE "${recipe.id}" (${recipe.label}):`,
    `Required surface order: ${recipe.surfaces.join(' → ')}`,
    `Pedagogy: ${recipe.pedagogy}`,
    `Target ${recipe.sceneBudget.min}-${recipe.sceneBudget.max} scenes.`,
    'Prefer type "ide" (with a run step) over separate "code"+"terminal" panels for coding topics.',
    'Include a "quiz". Include a closing "bullets" recap. For loops/algorithms include a "viz". For API topics include an "api" scene.',
  ].join('\n');
}

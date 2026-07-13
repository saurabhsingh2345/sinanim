import { Scene, PRIMARY_CARD_TYPES, OVERLAY_TYPES } from './types';

export interface InsertCatalogItem {
  type: Scene['type'];
  label: string;
  useWhen: string;
  group: 'teach' | 'code' | 'check' | 'overlay';
}

/** Human-readable beat title for the storyboard. */
export function sceneBeatTitle(s: Scene, index: number): string {
  switch (s.type) {
    case 'title':
      return s.text || 'Title';
    case 'chapter':
      return s.text || `Chapter ${s.number ?? index + 1}`;
    case 'bullets':
      return s.title || 'Key points';
    case 'ide':
      return s.project ? `Build ${s.project}` : s.steps[0]?.caption || 'In the editor';
    case 'cli':
      return s.title || s.commands[0]?.command || 'In the terminal';
    case 'browser': {
      const hero = s.blocks.find((b) => b.kind === 'hero');
      if (hero && hero.kind === 'hero' && hero.heading) return hero.heading;
      return s.title || 'In the browser';
    }
    case 'split':
      return s.filename || 'Code + preview';
    case 'layout':
      return 'Code beside preview';
    case 'api':
      return `${s.method} ${s.url.replace(/^https?:\/\//, '').slice(0, 28)}`;
    case 'pr':
      return s.title || `Review ${s.filename}`;
    case 'quiz':
      return 'Checkpoint quiz';
    case 'challenge':
      return s.concept || 'Your turn';
    case 'diagram':
      return s.title || 'How it fits together';
    case 'quote':
      return 'Worth remembering';
    case 'bigstat':
      return s.label || s.value;
    case 'viz':
      return s.title || 'Visualized';
    case 'mascot':
      return `Bit ${s.action}s`;
    case 'code':
      return s.title || `${s.language} code`;
    case 'diff':
      return s.title || 'Evolving the code';
    case 'terminal':
      return 'Running it';
    case 'recall':
      return s.concept ? `Recall: ${s.concept}` : 'Quick recall';
    case 'cheatsheet':
      return s.title || 'Cheat sheet';
    default:
      return `Beat ${index + 1}`;
  }
}

export function sceneTypeLabel(type: Scene['type']): string {
  const map: Partial<Record<Scene['type'], string>> = {
    title: 'Title card',
    chapter: 'Chapter',
    bullets: 'Bullet list',
    ide: 'VS Code',
    cli: 'Terminal',
    browser: 'Browser',
    browserrec: 'Browser recording',
    split: 'Code + preview',
    layout: 'Side-by-side',
    api: 'API call',
    pr: 'Pull request',
    quiz: 'Quiz',
    challenge: 'Challenge',
    diagram: 'Diagram',
    quote: 'Quote',
    bigstat: 'Big number',
    viz: 'Visualization',
    mascot: 'Mascot',
    code: 'Code',
    diff: 'Diff',
    terminal: 'Terminal output',
    recall: 'Recall',
    cheatsheet: 'Cheat sheet',
  };
  return map[type] || type;
}

export const INSERT_CATALOG: InsertCatalogItem[] = [
  { type: 'title', label: 'Title card', useWhen: 'Open or close a lesson with a big headline', group: 'teach' },
  { type: 'chapter', label: 'Chapter', useWhen: 'Divide a longer lesson into sections', group: 'teach' },
  { type: 'bullets', label: 'Bullet list', useWhen: 'Goals, recap, or key takeaways', group: 'teach' },
  { type: 'diagram', label: 'Diagram', useWhen: 'Show how pieces connect', group: 'teach' },
  { type: 'quote', label: 'Quote', useWhen: 'Land a memorable line', group: 'teach' },
  { type: 'ide', label: 'VS Code', useWhen: 'Build files, type code, run commands', group: 'code' },
  { type: 'cli', label: 'Terminal', useWhen: 'Scaffold, install, run CLI tools', group: 'code' },
  { type: 'browser', label: 'Browser', useWhen: 'Demo a live web page', group: 'code' },
  { type: 'split', label: 'Code + preview', useWhen: 'Type HTML/CSS and see it update', group: 'code' },
  { type: 'layout', label: 'Side-by-side', useWhen: 'Editor and browser at once', group: 'code' },
  { type: 'api', label: 'API call', useWhen: 'Show a REST request and response', group: 'code' },
  { type: 'pr', label: 'Pull request', useWhen: 'Review a before/after diff', group: 'code' },
  { type: 'viz', label: 'Visualization', useWhen: 'Animate arrays, pointers, accumulators', group: 'code' },
  { type: 'code', label: 'Code panel', useWhen: 'Short typed snippet (prefer IDE for full demos)', group: 'code' },
  { type: 'diff', label: 'Code diff', useWhen: 'Evolve before → after in place', group: 'code' },
  { type: 'terminal', label: 'Terminal output', useWhen: 'Show a classic run after a code panel', group: 'code' },
  { type: 'bigstat', label: 'Big number', useWhen: 'Land a memorable stat or result', group: 'teach' },
  { type: 'recall', label: 'Recall', useWhen: 'Open a follow-up lesson by reviewing a prior concept', group: 'teach' },
  { type: 'cheatsheet', label: 'Cheat sheet', useWhen: 'Close a lesson with concepts + snippets + gotchas', group: 'teach' },
  { type: 'quiz', label: 'Quiz', useWhen: 'Check understanding mid-lesson', group: 'check' },
  { type: 'challenge', label: 'Challenge', useWhen: 'Learner writes real code', group: 'check' },
  { type: 'mascot', label: 'Mascot', useWhen: 'Bit waves, points, or celebrates (overlay)', group: 'overlay' },
];

export function isPrimaryScene(s: Scene): boolean {
  return PRIMARY_CARD_TYPES.has(s.type) || !OVERLAY_TYPES.has(s.type);
}

export function isOverlayScene(s: Scene): boolean {
  return OVERLAY_TYPES.has(s.type);
}

export function blankScene(type: Scene['type'], startTime: number): Scene {
  const base = { startTime, duration: 6, narration: '', transition: 'fade' as const };
  switch (type) {
    case 'title':
      return { type: 'title', text: 'New lesson', subtitle: 'Customize this title', ...base };
    case 'chapter':
      return { type: 'chapter', number: 1, text: 'Getting started', ...base, duration: 3 };
    case 'bullets':
      return {
        type: 'bullets',
        title: 'What you will learn',
        items: ['First idea', 'Second idea', 'Third idea'],
        ...base,
        narration: 'Here is what we will cover. First the idea, then we build it, then we check that it stuck.',
      };
    case 'diagram':
      return {
        type: 'diagram',
        title: 'How it flows',
        nodes: [
          { id: 'a', label: 'Input', x: 0.2, y: 0.5 },
          { id: 'b', label: 'Process', x: 0.5, y: 0.5 },
          { id: 'c', label: 'Output', x: 0.8, y: 0.5 },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
        ],
        ...base,
        duration: 8,
        narration: 'Data moves from input, through the process, and out as a result. Keep this picture in mind as we code.',
      };
    case 'quote':
      return {
        type: 'quote',
        text: 'Make it work, make it right, make it fast.',
        attribution: 'Kent Beck',
        ...base,
        duration: 4,
      };
    case 'ide':
      return {
        type: 'ide',
        project: 'my-app',
        files: [{ path: 'main.py', language: 'python', code: '' }],
        steps: [
          { caption: 'Open the file', action: { kind: 'open', file: 'main.py' } },
          {
            caption: 'Write a hello',
            action: { kind: 'type', file: 'main.py', code: 'print("Hello, course!")' },
          },
          {
            caption: 'Run it',
            action: { kind: 'run', command: 'python main.py', output: 'Hello, course!' },
          },
        ],
        ...base,
        duration: 14,
        narration:
          'We open the editor, write a tiny program, and run it. Watch the file tree and the terminal evolve together.',
      };
    case 'cli':
      return {
        type: 'cli',
        title: 'zsh — ~/projects',
        cwd: '~/projects',
        commands: [
          { command: 'mkdir demo && cd demo', output: '' },
          { command: 'echo "ready"', output: 'ready' },
        ],
        ...base,
        duration: 10,
        narration: 'In the terminal we create a folder and confirm we are ready to build.',
      };
    case 'browser':
      return {
        type: 'browser',
        url: 'https://example.dev',
        title: 'Example',
        pageTheme: 'light',
        blocks: [
          { kind: 'nav', brand: '◆ Example', links: ['Docs', 'Pricing'] },
          { kind: 'hero', heading: 'Your product here', sub: 'Edit every block in the studio.', cta: 'Get started' },
        ],
        clickBlock: 1,
        ...base,
        duration: 10,
        narration: 'Here is the page learners will see. The hero and call to action come in as we talk through them.',
      };
    case 'split':
      return {
        type: 'split',
        language: 'html',
        filename: 'index.html',
        pageTheme: 'light',
        steps: [
          { caption: 'Add a heading', code: '<h1>Hello</h1>', blocks: [{ kind: 'hero', heading: 'Hello' }] },
          {
            caption: 'Add a button',
            code: '<h1>Hello</h1>\n<button>Go</button>',
            blocks: [{ kind: 'hero', heading: 'Hello' }, { kind: 'button', label: 'Go', primary: true }],
          },
        ],
        ...base,
        duration: 12,
        narration: 'As we type on the left, the preview on the right updates. First a heading, then a button.',
      };
    case 'layout':
      return {
        type: 'layout',
        preset: 'ide-browser',
        focus: 0,
        regions: [
          {
            type: 'ide',
            project: 'landing',
            files: [{ path: 'index.html', language: 'html', code: '<h1>Hello</h1>' }],
            steps: [{ caption: 'Open', action: { kind: 'open', file: 'index.html' } }],
          },
          {
            type: 'browser',
            url: 'localhost:3000',
            pageTheme: 'light',
            blocks: [{ kind: 'hero', heading: 'Hello' }],
          },
        ],
        ...base,
        duration: 12,
        narration: 'Code on the left, live page on the right. This is how we teach front-end changes.',
      };
    case 'api':
      return {
        type: 'api',
        method: 'GET',
        url: 'https://api.example.dev/v1/items',
        status: 200,
        statusText: 'OK',
        response: '{\n  "items": []\n}',
        ...base,
        duration: 8,
        narration: 'We call the API and read the JSON response. Status two hundred means success.',
      };
    case 'pr':
      return {
        type: 'pr',
        title: 'Improve the function',
        filename: 'app.py',
        language: 'python',
        before: 'def greet(name):\n    return "hi"',
        after: 'def greet(name):\n    return f"Hello, {name}!"',
        ...base,
        duration: 10,
        narration: 'In this pull request we replace a hard-coded greeting with a real personalized message.',
      };
    case 'quiz':
      return {
        type: 'quiz',
        question: 'What did we just learn?',
        options: ['The wrong idea', 'The right idea', 'Something unrelated'],
        answerIndex: 1,
        explanation: 'We practiced the right idea — that is the takeaway.',
        ...base,
        duration: 8,
        narration: 'Quick check. Which option matches what we just built?',
      };
    case 'challenge':
      return {
        type: 'challenge',
        language: 'python',
        prompt: 'Write double(n) that returns n times two.',
        starterCode: 'def double(n):\n    # your code here\n    pass',
        solution: 'def double(n):\n    return n * 2',
        tests: [
          { expression: 'double(2)', expected: '4' },
          { expression: 'double(0)', expected: '0' },
        ],
        hint: 'Use the multiply operator.',
        concept: 'functions',
        ...base,
        duration: 12,
        narration: 'Your turn. Write a function that doubles a number, then run the tests.',
      };
    case 'mascot':
      return { type: 'mascot', action: 'wave', ...base, duration: 3, narration: 'Bit says hello.' };
    case 'viz':
      return {
        type: 'viz',
        title: 'Watch it run',
        vizKind: 'array',
        steps: [
          { caption: 'Start', array: ['1', '2', '3'], highlight: [0], vars: { i: '0', total: '0' } },
          { caption: 'Add first', array: ['1', '2', '3'], highlight: [0], vars: { i: '0', total: '1' } },
          { caption: 'Add next', array: ['1', '2', '3'], highlight: [1], vars: { i: '1', total: '3' } },
          { caption: 'Done', array: ['1', '2', '3'], done: [0, 1, 2], vars: { i: '2', total: '6' } },
        ],
        ...base,
        duration: 10,
        narration: 'Watch the values update as we walk the list. The accumulator grows with each step.',
      };
    case 'code':
      return {
        type: 'code',
        language: 'python',
        code: 'print("hello")',
        typingSpeed: 40,
        title: 'Snippet',
        ...base,
        duration: 6,
        narration: 'Here is a short snippet that prints a greeting.',
      };
    case 'diff':
      return {
        type: 'diff',
        language: 'python',
        before: 'x = 1',
        after: 'x = 1\ny = x + 1',
        typingSpeed: 40,
        title: 'Evolve the code',
        ...base,
        duration: 8,
        narration: 'We keep the first line and add a second that builds on it.',
      };
    case 'terminal':
      return {
        type: 'terminal',
        prompt: '$ ',
        command: 'python main.py',
        output: 'hello',
        typingSpeed: 40,
        ...base,
        duration: 4,
        narration: 'Running the program prints the result.',
      };
    case 'bigstat':
      return {
        type: 'bigstat',
        value: '10x',
        label: 'faster with the right loop',
        ...base,
        duration: 4,
        narration: 'That change made a huge difference.',
      };
    case 'recall':
      return {
        type: 'recall',
        concept: 'last lesson',
        source: 'from the previous lesson',
        question: 'What did we build last time?',
        answer: 'The idea this lesson builds on — edit this to match your course.',
        ...base,
        duration: 6,
        narration: 'Quick recall before we start. What did we cover last time? … The idea this lesson builds on.',
      };
    case 'cheatsheet':
      return {
        type: 'cheatsheet',
        title: 'Cheat sheet',
        items: [
          { label: 'Concept one', code: 'example()', note: 'One-line takeaway.' },
          { label: 'Concept two', code: 'other()', note: 'The gotcha to remember.' },
        ],
        ...base,
        duration: 9,
        narration: 'Here is everything from this lesson in one card to screenshot and keep.',
      };
    default:
      return { type: 'wait', ...base };
  }
}

export function retimeScenes(scenes: Scene[]): Scene[] {
  let t = 0;
  return scenes.map((s) => {
    const next = { ...s, startTime: t };
    t += Math.max(s.duration, 0.5) + 0.35;
    return next;
  });
}

// Ready-made mini-lessons — each is a full teaching arc, not a single chrome demo.
// Authors drop these in, then customize every beat in the Course Studio.

export interface TemplateDef {
  id: string;
  label: string;
  blurb: string;
  ready: boolean;
  build: () => any;
}

const base = (title: string, scenes: any[], theme = 'midnight', brand?: { name: string; accent: string }): any => ({
  title,
  fps: 30,
  width: 1920,
  height: 1080,
  backgroundColor: '#0b0b10',
  theme,
  brand,
  captions: true,
  scenes,
});

/** Flask API — title → bullets → IDE → quiz → recap */
const IDE_DEMO = () =>
  base(
    'Build a tiny Flask API',
    [
      {
        type: 'title',
        text: 'A tiny Flask API',
        subtitle: 'built live in the editor',
        startTime: 0,
        duration: 3.5,
        transition: 'fade',
        theme: 'nord',
        narration:
          'Let us build a small todo API from scratch. No screen recording — the editor itself is the video. By the end you will have a model, a route, and a running server.',
      },
      {
        type: 'bullets',
        title: 'What we will build',
        items: ['A Todo model with text and done', 'A Flask route that returns JSON', 'A live server you can hit'],
        startTime: 3.5,
        duration: 7,
        transition: 'slide',
        narration:
          'Three beats. First we define what a todo is. Then we expose it over HTTP. Finally we run the server and see a real response. Keep that arc in mind.',
      },
      {
        type: 'ide',
        project: 'todo-api',
        branch: 'main',
        theme: 'nord',
        transition: 'fade',
        files: [
          { path: 'app.py', language: 'python', code: '' },
          { path: 'requirements.txt', language: 'text', code: 'flask\n' },
        ],
        steps: [
          { caption: 'Create the model file', action: { kind: 'create', file: 'models/todo.py' } },
          {
            caption: 'Define the Todo model',
            action: {
              kind: 'type',
              file: 'models/todo.py',
              code: 'class Todo:\n    def __init__(self, text):\n        self.text = text\n        self.done = False\n\n    def toggle(self):\n        self.done = not self.done',
              typingSpeed: 38,
            },
            key: '⌘S',
          },
          {
            caption: 'Wire up the Flask app',
            action: {
              kind: 'type',
              file: 'app.py',
              code: 'from flask import Flask, jsonify\nfrom models.todo import Todo\n\napp = Flask(__name__)\ntodos = [Todo("Ship the IDE template")]\n\n@app.route("/todos")\ndef list_todos():\n    return jsonify([t.text for t in todos])',
              typingSpeed: 40,
            },
          },
          {
            caption: 'This route returns our todos',
            action: { kind: 'highlight', file: 'app.py', startLine: 7, endLine: 9 },
          },
          {
            caption: 'Run the server',
            action: {
              kind: 'run',
              command: 'python app.py',
              output: ' * Serving Flask app "app"\n * Running on http://127.0.0.1:5000\n127.0.0.1 - - "GET /todos" 200 -',
            },
          },
        ],
        startTime: 10.5,
        duration: 28,
        narration:
          'We create a models file and define a Todo with text and a done flag. In app dot py we build the Flask app, keep a list of todos, and expose a route that returns them as JSON. Highlight the route — that is the contract. Then we run the server and hit it. All without leaving the editor.',
      },
      {
        type: 'mascot',
        action: 'celebrate',
        startTime: 36,
        duration: 2.5,
        narration: 'Nice. The API is alive.',
      },
      {
        type: 'quiz',
        question: 'What does the /todos route return?',
        options: ['HTML for a page', 'JSON list of todo text', 'A database connection'],
        answerIndex: 1,
        explanation: 'jsonify turns the list of todo text into a JSON response — that is the API contract.',
        startTime: 38.5,
        duration: 8,
        narration: 'Quick check before we wrap up. What does that route actually return to the client?',
      },
      {
        type: 'bullets',
        title: 'You now know',
        items: ['Models hold state', 'Routes expose JSON', 'Run locally to verify'],
        startTime: 46.5,
        duration: 6,
        narration:
          'Models hold state. Routes expose JSON. And you always run locally to verify. That pattern scales from this tiny API to real services.',
      },
    ],
    'nord',
    { name: 'newani', accent: '#88c0d0' },
  );

/** Vite scaffold — title → CLI → browser → bullets */
const CLI_DEMO = () =>
  base(
    'Scaffold a Vite app in three commands',
    [
      {
        type: 'title',
        text: 'Scaffold in 60 seconds',
        subtitle: 'Vite + React from the terminal',
        startTime: 0,
        duration: 3,
        transition: 'fade',
        narration: 'Three commands. A running React app. No GUI wizard — just the terminal, paced with the voice.',
      },
      {
        type: 'cli',
        title: 'zsh — ~/projects',
        cwd: '~/projects',
        theme: 'solarized',
        commands: [
          {
            command: 'npm create vite@latest my-app -- --template react',
            output: '\n✔ Scaffolding project in ./my-app...\n✔ Done. Now run:',
          },
          {
            command: 'cd my-app && npm install',
            output: 'added 231 packages in 3.2s\n\n42 packages are looking for funding',
          },
          {
            command: 'npm run dev',
            output: '\n  VITE v5.0.0  ready in 412 ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  press h + enter to show help',
          },
        ],
        startTime: 3,
        duration: 16,
        narration:
          'We scaffold a fresh React app with Vite, install the dependencies, and start the dev server. Watch for the local URL — that is where the app lives.',
      },
      {
        type: 'browser',
        url: 'http://localhost:5173/',
        title: 'Vite + React',
        pageTheme: 'dark',
        theme: 'solarized',
        tabs: [
          { title: 'localhost:5173', url: 'http://localhost:5173/', active: true },
          { title: 'Vite Docs', url: 'https://vitejs.dev', active: false },
        ],
        blocks: [
          { kind: 'nav', brand: '⚡ Vite', links: ['Docs'] },
          {
            kind: 'hero',
            heading: 'Vite + React',
            sub: 'Your scaffold is running. Edit App.jsx and hot reload takes over.',
            cta: 'Open docs',
          },
        ],
        clickBlock: 1,
        startTime: 19,
        duration: 9,
        narration:
          'Here is what those three commands bought us — a live page on localhost. Click through, then go edit the source. Hot reload will keep up.',
      },
      {
        type: 'bullets',
        title: 'What each command did',
        items: ['create vite — project files', 'npm install — dependencies', 'npm run dev — local server'],
        startTime: 28,
        duration: 7,
        narration:
          'Create scaffolds the files. Install pulls packages. Dev starts the server. Memorize that trio — you will use it constantly.',
      },
    ],
    'solarized',
  );

/** Landing page — title → browser → quiz */
const BROWSER_DEMO = () =>
  base(
    'Ship a landing page, section by section',
    [
      {
        type: 'title',
        text: 'A landing page, live',
        subtitle: 'nav → hero → cards → click',
        startTime: 0,
        duration: 3,
        theme: 'warm-studio',
        narration: 'We will walk a marketing page the way a learner sees it — section by section, with a real click at the end.',
      },
      {
        type: 'browser',
        url: 'https://acme.dev',
        title: 'Acme',
        pageTheme: 'light',
        theme: 'warm-studio',
        tabs: [
          { title: 'Acme', url: 'https://acme.dev', active: true },
          { title: 'Docs', url: 'https://acme.dev/docs', active: false },
        ],
        blocks: [
          { kind: 'nav', brand: '◆ Acme', links: ['Features', 'Pricing', 'Docs'] },
          {
            kind: 'hero',
            heading: 'Ship faster with Acme',
            sub: 'The all-in-one platform for building and shipping web apps.',
            cta: 'Get started free',
          },
          { kind: 'card', title: 'Instant', body: 'Hot reload and optimized builds out of the box.' },
          { kind: 'card', title: 'Simple', body: 'A clean API that gets out of your way.' },
        ],
        clickBlock: 1,
        startTime: 3,
        duration: 14,
        narration:
          'Nav first — brand and links. Then the hero with a clear call to action. Feature cards land last. Near the end, the cursor clicks Get started. That is the conversion moment.',
      },
      {
        type: 'quiz',
        question: 'Which block usually carries the main call to action?',
        options: ['A feature card', 'The hero section', 'The footer links'],
        answerIndex: 1,
        explanation: 'The hero is where you put the primary CTA — one clear next step.',
        startTime: 17,
        duration: 8,
        narration: 'Quick check. Where does the main call to action usually live on a landing page?',
      },
    ],
    'warm-studio',
    { name: 'Acme', accent: '#f0a060' },
  );

/** Authored Chrome flow: search → SERP → Python docs (no live web). */
const WEB_PYTHON_DOCS = () =>
  base(
    'Find Python docs in the browser',
    [
      {
        type: 'title',
        text: 'Look it up',
        subtitle: 'search → results → docs',
        startTime: 0,
        duration: 3.5,
        theme: 'github-light',
        narration:
          'When you forget a detail, you look it up. We will search for Python for loops, open the official docs, and read the range example — all inside a real browser window, no live internet required.',
      },
      {
        type: 'browser',
        url: 'https://www.google.com/search?q=python+for+loop+docs',
        title: 'python for loop docs',
        pageTheme: 'light',
        theme: 'github-light',
        tabs: [
          { title: 'New Tab', url: 'chrome://newtab', active: false },
          { title: 'python for loop docs', url: 'https://www.google.com/search?q=python+for+loop+docs', active: true },
        ],
        blocks: [
          { kind: 'search', query: 'python for loop docs.python.org', engine: 'Google' },
        ],
        startTime: 3.5,
        duration: 8,
        narration:
          'We type the query into search: python for loop, docs dot python dot org. Prefer the official docs over random blogs.',
      },
      {
        type: 'browser',
        url: 'https://www.google.com/search?q=python+for+loop+docs',
        title: 'Search results',
        pageTheme: 'light',
        theme: 'github-light',
        tabs: [
          { title: 'Search', url: 'https://www.google.com/search?q=python+for+loop+docs', active: true },
        ],
        blocks: [
          {
            kind: 'serp',
            results: [
              {
                title: '4. More Control Flow Tools — Python 3 documentation',
                url: 'https://docs.python.org/3/tutorial/controlflow.html',
                snippet: 'The for statement in Python differs a bit from what you may be used to in C or Pascal…',
              },
              {
                title: 'Download Python | Python.org',
                url: 'https://www.python.org/downloads/',
                snippet: 'Download the latest version of Python for Windows, macOS, or Linux.',
              },
              {
                title: 'The Python Tutorial — Python 3.12.0 documentation',
                url: 'https://docs.python.org/3/tutorial/',
                snippet: 'Python is an easy to learn, powerful programming language…',
              },
            ],
          },
        ],
        clickBlock: 0,
        startTime: 11.5,
        duration: 10,
        narration:
          'Results appear. The first hit is the official control-flow tutorial. We click that — not a random Stack Overflow mirror.',
      },
      {
        type: 'browser',
        url: 'https://docs.python.org/3/tutorial/controlflow.html',
        title: 'Control Flow — Python docs',
        pageTheme: 'light',
        theme: 'github-light',
        tabs: [
          { title: 'Search', url: 'https://www.google.com/search?q=python+for+loop+docs', active: false },
          { title: '4. More Control Flow Tools', url: 'https://docs.python.org/3/tutorial/controlflow.html', active: true },
        ],
        blocks: [
          {
            kind: 'docs',
            heading: '4.2. for Statements',
            body: 'The for statement in Python differs a bit from what you may be used to in C or Pascal. Rather than always iterating over an arithmetic progression of numbers, Python’s for statement iterates over the items of any sequence.',
            sidebar: ['if', 'for Statements', 'range()', 'break'],
            active: 'for Statements',
            highlight: 'for i in range(5):',
          },
        ],
        startTime: 21.5,
        duration: 12,
        narration:
          'Here is the docs page. Sidebar on the left, for Statements highlighted. The key line uses range five — remember, that means zero through four. That is the detail we came for.',
      },
      {
        type: 'browser',
        url: 'https://www.python.org/downloads/',
        title: 'Download Python',
        pageTheme: 'light',
        theme: 'github-light',
        tabs: [
          { title: 'Downloads', url: 'https://www.python.org/downloads/', active: true },
        ],
        blocks: [
          { kind: 'nav', brand: 'Python', links: ['Downloads', 'Documentation', 'Community'] },
          {
            kind: 'hero',
            heading: 'Download the latest Python',
            sub: 'Python 3.12 — free and open source for every major platform.',
            cta: 'Download Python 3.12',
          },
          { kind: 'text', text: 'Looking for a specific release? Browse older versions below, or jump straight to the docs after you install.' },
        ],
        clickBlock: 1,
        startTime: 33.5,
        duration: 10,
        narration:
          'Same skill for downloads. Open python.org slash downloads, and click the big Download button. Install first, then come back to the docs when you need a reference.',
      },
      {
        type: 'quiz',
        question: 'Where should you prefer to look up Python language details?',
        options: ['Random blog posts', 'docs.python.org', 'Only Stack Overflow titles'],
        answerIndex: 1,
        explanation: 'Official docs are authoritative; blogs and forums are great supplements after you know the source of truth.',
        startTime: 43.5,
        duration: 8,
        narration: 'Quick check. When you need the real definition of for or range, where do you go first?',
      },
      {
        type: 'bullets',
        title: 'Remember',
        items: ['Search with the official site in mind', 'Click the docs result, not a mirror', 'Read the highlighted example on the page'],
        startTime: 51.5,
        duration: 7,
        narration:
          'Search with intent, open the official page, and read the example on screen. That is how you look things up like a working developer.',
      },
    ],
    'github-light',
  );

/** HTML live preview — multi-step with wrong then right */
const SPLIT_DEMO = () =>
  base(
    'HTML that updates as you type',
    [
      {
        type: 'title',
        text: 'Code + live preview',
        subtitle: 'type left, see right',
        startTime: 0,
        duration: 3,
        theme: 'github-light',
        narration: 'The classic front-end lesson: type HTML on the left and watch the page appear on the right.',
      },
      {
        type: 'split',
        language: 'html',
        filename: 'index.html',
        url: 'localhost:3000',
        pageTheme: 'light',
        theme: 'github-light',
        steps: [
          { caption: 'Start with a heading', code: '<h1>Todo App</h1>', blocks: [{ kind: 'hero', heading: 'Todo App' }] },
          {
            caption: 'Add an input',
            code: '<h1>Todo App</h1>\n<input placeholder="What needs doing?">',
            blocks: [{ kind: 'hero', heading: 'Todo App' }, { kind: 'input', placeholder: 'What needs doing?' }],
          },
          {
            caption: 'Add the button',
            code: '<h1>Todo App</h1>\n<input placeholder="What needs doing?">\n<button>Add</button>',
            blocks: [
              { kind: 'hero', heading: 'Todo App' },
              { kind: 'input', placeholder: 'What needs doing?' },
              { kind: 'button', label: 'Add', primary: true },
            ],
          },
        ],
        startTime: 3,
        duration: 16,
        narration:
          'First a heading so the page has a title. Then an input for the task. Finally the add button. Each step is a full snapshot — the preview always matches the code.',
      },
      {
        type: 'bullets',
        title: 'Remember',
        items: ['Preview follows the full file', 'One change per step', 'Buttons need a label'],
        startTime: 19,
        duration: 6,
        narration: 'Preview follows the full file. Change one thing per step. And every button needs a clear label.',
      },
    ],
    'github-light',
  );

/** API — error then success */
const API_DEMO = () =>
  base(
    'Call a REST API the right way',
    [
      {
        type: 'chapter',
        number: 1,
        text: 'Create a todo',
        startTime: 0,
        duration: 2.5,
        narration: 'Chapter one. We will POST a new todo and read the response.',
      },
      {
        type: 'api',
        method: 'POST',
        url: 'https://api.acme.dev/v1/todos',
        requestBody: '{\n  "text": "Ship the templates"\n}',
        status: 201,
        statusText: 'Created',
        response:
          '{\n  "id": 42,\n  "text": "Ship the templates",\n  "done": false,\n  "createdAt": "2026-07-10T09:00:00Z"\n}',
        startTime: 2.5,
        duration: 11,
        narration:
          'We send a POST with the todo text. The server answers two oh one Created and returns the full saved record, including the id it assigned. That id is how we talk about this todo later.',
      },
      {
        type: 'bullets',
        title: 'Status codes that matter',
        items: ['201 — created', '400 — bad request', '404 — missing'],
        startTime: 13.5,
        duration: 7,
        narration:
          'Two oh one means created. Four hundred means your body was wrong. Four oh four means the resource is missing. Read the status before you trust the JSON.',
      },
      {
        type: 'quiz',
        question: 'A successful POST that creates a resource usually returns…',
        options: ['200 OK', '201 Created', '204 No Content'],
        answerIndex: 1,
        explanation: '201 Created is the conventional success code when a new resource is born.',
        startTime: 20.5,
        duration: 7,
        narration: 'Which status code usually means a new resource was created?',
      },
    ],
    'midnight',
  );

/** PR review with pedagogy */
const PR_DEMO = () =>
  base(
    'Review a security fix PR',
    [
      {
        type: 'title',
        text: 'Why this PR matters',
        subtitle: 'plaintext passwords → hashed check',
        startTime: 0,
        duration: 3.5,
        theme: 'high-contrast',
        narration:
          'This pull request fixes a real security bug. We will read the diff the way a reviewer does — line by line, with the why out loud.',
      },
      {
        type: 'pr',
        title: 'Add input validation',
        filename: 'auth.py',
        language: 'python',
        theme: 'high-contrast',
        before:
          'def login(email, password):\n    user = db.find(email)\n    if user.password == password:\n        return token(user)\n    return None',
        after:
          'def login(email, password):\n    if not email or not password:\n        raise ValueError("missing credentials")\n    user = db.find(email)\n    if user and check_hash(password, user.password):\n        return token(user)\n    return None',
        startTime: 3.5,
        duration: 14,
        narration:
          'Before: we compared passwords in plain text and assumed the user exists. After: we guard missing credentials, and we compare a hash. That is the whole fix. Green lines are additions. Red lines are removals.',
      },
      {
        type: 'mascot',
        action: 'point',
        line: 5,
        startTime: 16,
        duration: 3,
        narration: 'Bit points at the hash check — never store or compare raw passwords.',
      },
      {
        type: 'quiz',
        question: 'Why is user.password == password dangerous?',
        options: [
          'It is slower than hashing',
          'It compares secrets in plaintext',
          'It always returns None',
        ],
        answerIndex: 1,
        explanation: 'Plaintext comparison means the real password must be stored or transmitted that way — a leak exposes everything.',
        startTime: 19,
        duration: 8,
        narration: 'Why was the old comparison dangerous?',
      },
    ],
    'high-contrast',
  );

/** Side-by-side IDE + browser */
const LAYOUT_DEMO = () =>
  base(
    'Edit code, see the page',
    [
      {
        type: 'title',
        text: 'Side by side',
        subtitle: 'editor · browser',
        startTime: 0,
        duration: 3,
        theme: 'nord',
        narration: 'Sometimes you need both surfaces at once — type on the left, watch the page on the right.',
      },
      {
        type: 'layout',
        preset: 'ide-browser',
        focus: 0,
        theme: 'nord',
        transition: 'fade',
        regions: [
          {
            type: 'ide',
            project: 'landing',
            files: [{ path: 'index.html', language: 'html', code: '' }],
            steps: [
              {
                caption: 'Write the hero',
                action: {
                  kind: 'type',
                  file: 'index.html',
                  code: '<h1>Hello Acme</h1>\n<p>Ship faster.</p>\n<button>Get started</button>',
                },
              },
            ],
          },
          {
            type: 'browser',
            url: 'localhost:3000',
            title: 'Acme',
            pageTheme: 'light',
            blocks: [
              { kind: 'hero', heading: 'Hello Acme', sub: 'Ship faster.', cta: 'Get started' },
            ],
          },
        ],
        startTime: 3,
        duration: 14,
        narration:
          'On the left we type the HTML. On the right the browser shows the same story — heading, subcopy, button. This is how front-end lessons should feel.',
      },
      {
        type: 'quiz',
        question: 'In a side-by-side lesson, what should stay in sync?',
        options: ['Only the URL bar', 'The code and the preview', 'Only the theme colors'],
        answerIndex: 1,
        explanation: 'The preview must match the code snapshot — that is the teaching contract.',
        startTime: 17,
        duration: 7,
        narration: 'What has to stay in sync for this pattern to teach well?',
      },
    ],
    'nord',
  );

/** New: diagram + concept lesson */
const DIAGRAM_DEMO = () =>
  base(
    'How a request flows',
    [
      {
        type: 'title',
        text: 'Request flow',
        subtitle: 'browser → server → database',
        startTime: 0,
        duration: 3,
        narration: 'Before we write code, picture the path a request takes. Diagrams make that path sticky.',
      },
      {
        type: 'diagram',
        title: 'HTTP round trip',
        aesthetic: 'sketch',
        nodes: [
          { id: 'b', label: 'Browser', x: 0.18, y: 0.5, color: '#88c0d0' },
          { id: 's', label: 'Server', x: 0.5, y: 0.5, color: '#a3be8c' },
          { id: 'd', label: 'Database', x: 0.82, y: 0.5, color: '#ebcb8b' },
        ],
        edges: [
          { from: 'b', to: 's', label: 'HTTP' },
          { from: 's', to: 'd', label: 'query' },
          { from: 'd', to: 's', label: 'rows' },
          { from: 's', to: 'b', label: 'JSON' },
        ],
        startTime: 3,
        duration: 12,
        narration:
          'The browser sends HTTP to the server. The server queries the database. Rows come back. The server answers with JSON. Four arrows — one mental model for half of web development.',
      },
      {
        type: 'bullets',
        title: 'Keep this picture',
        items: ['Browser starts the request', 'Server owns the logic', 'Database stores the truth'],
        startTime: 15,
        duration: 7,
        narration:
          'Browser starts the request. Server owns the logic. Database stores the truth. When something breaks, ask which arrow failed.',
      },
    ],
    'nord',
  );

/** New: challenge-focused lesson */
const CHALLENGE_DEMO = () =>
  base(
    'Your turn: write double()',
    [
      {
        type: 'title',
        text: 'Hands-on checkpoint',
        subtitle: 'write a real function',
        startTime: 0,
        duration: 3,
        narration: 'Lessons stick when you write code. This beat pauses the video and waits for your solution.',
      },
      {
        type: 'bullets',
        title: 'The task',
        items: ['Name: double', 'Input: a number n', 'Output: n times two'],
        startTime: 3,
        duration: 6,
        narration: 'Write a function called double. It takes a number n and returns n times two. Two tests will check you.',
      },
      {
        type: 'challenge',
        language: 'python',
        prompt: 'Write double(n) that returns n times two.',
        starterCode: 'def double(n):\n    # your code here\n    pass',
        solution: 'def double(n):\n    return n * 2',
        tests: [
          { expression: 'double(2)', expected: '4' },
          { expression: 'double(0)', expected: '0' },
        ],
        hint: 'Use the multiply operator *',
        concept: 'functions / multiply',
        startTime: 9,
        duration: 12,
        narration: 'Pause here. Write the function. Run the tests. When they pass, you have earned the next lesson.',
      },
    ],
    'midnight',
  );

/** Gold pack: complete Python for/while loops lesson. */
const PYTHON_LOOPS = () =>
  base(
    'Python for & while loops',
    [
      {
        type: 'title',
        text: 'Python loops',
        subtitle: 'for · while · when to use each',
        startTime: 0,
        duration: 4,
        transition: 'fade',
        theme: 'nord',
        narration:
          'Today we learn the two loops every Python program needs. A for loop walks a known sequence. A while loop keeps going until a condition says stop. By the end you will write both, fix a common mistake, and see them run for real.',
      },
      {
        type: 'bullets',
        title: 'What you will learn',
        items: [
          'for — walk a range or list',
          'while — repeat until a condition fails',
          'When to pick which — and how to avoid infinite loops',
        ],
        startTime: 4,
        duration: 8,
        transition: 'slide',
        narration:
          'Three ideas. First, for loops when you know how many times. Second, while loops when you wait for a condition. Third, how to choose — and why the loop variable must always change. Keep that map in your head as we code.',
      },
      {
        type: 'ide',
        project: 'loops-lab',
        branch: 'main',
        theme: 'nord',
        transition: 'fade',
        files: [{ path: 'loops.py', language: 'python', code: '' }],
        steps: [
          { caption: 'Open loops.py', action: { kind: 'open', file: 'loops.py' }, weight: 0.6 },
          {
            caption: 'Oops: range stops too early',
            action: {
              kind: 'type',
              file: 'loops.py',
              code: '# Naive: range(1, 5) never reaches 5\nfor i in range(1, 5):\n    print(i)',
              typingSpeed: 36,
            },
            weight: 1.2,
          },
          {
            caption: 'Run the buggy version',
            action: {
              kind: 'run',
              command: 'python loops.py',
              output: '1\n2\n3\n4',
            },
            weight: 1,
          },
          {
            caption: 'Fix: range(1, 6) and add while',
            action: {
              kind: 'type',
              file: 'loops.py',
              code: '# for: walk a known sequence (end is exclusive)\nfor i in range(1, 6):\n    print(i)\n\n# while: repeat until the condition fails\ntotal = 0\nn = 1\nwhile n <= 5:\n    total = total + n\n    n = n + 1\nprint("sum:", total)',
              typingSpeed: 40,
            },
            key: '⌘S',
            weight: 1.4,
          },
          {
            caption: 'The while condition + bump',
            action: { kind: 'highlight', file: 'loops.py', startLine: 8, endLine: 10 },
            weight: 0.9,
          },
          {
            caption: 'Run the fixed program',
            action: {
              kind: 'run',
              command: 'python loops.py',
              output: '1\n2\n3\n4\n5\nsum: 15',
            },
            weight: 1.1,
          },
        ],
        startTime: 12,
        duration: 36,
        narration:
          'We open loops dot py. First a common trap: range one to five prints only one through four, because the end is exclusive. That is the off-by-one you will hit forever. We fix it with range one to six so five is included. Then a while loop adds those same numbers into total, bumping n each time until n is greater than five. Watch the condition and the bump — forget either and you loop forever. Finally we run it and see one through five, then sum fifteen.',
      },
      {
        type: 'mascot',
        action: 'celebrate',
        side: 'right',
        startTime: 47.5,
        duration: 2.5,
        narration: 'Nice — the fixed run matches what we wanted.',
      },
      {
        type: 'viz',
        title: 'While loop: building the sum',
        vizKind: 'array',
        steps: [
          {
            caption: 'Start: total is 0, n is 1',
            array: ['1', '2', '3', '4', '5'],
            pointers: [{ name: 'n', index: 0 }],
            vars: { total: '0', n: '1' },
            highlight: [0],
          },
          {
            caption: 'Add 1 → total 1, n becomes 2',
            array: ['1', '2', '3', '4', '5'],
            pointers: [{ name: 'n', index: 1 }],
            vars: { total: '1', n: '2' },
            highlight: [1],
            done: [0],
          },
          {
            caption: 'Add 2 → total 3',
            array: ['1', '2', '3', '4', '5'],
            pointers: [{ name: 'n', index: 2 }],
            vars: { total: '3', n: '3' },
            highlight: [2],
            done: [0, 1],
          },
          {
            caption: 'Add 3 → total 6',
            array: ['1', '2', '3', '4', '5'],
            pointers: [{ name: 'n', index: 3 }],
            vars: { total: '6', n: '4' },
            highlight: [3],
            done: [0, 1, 2],
          },
          {
            caption: 'Add 4 → total 10',
            array: ['1', '2', '3', '4', '5'],
            pointers: [{ name: 'n', index: 4 }],
            vars: { total: '10', n: '5' },
            highlight: [4],
            done: [0, 1, 2, 3],
          },
          {
            caption: 'Add 5 → total 15, n becomes 6 — stop',
            array: ['1', '2', '3', '4', '5'],
            vars: { total: '15', n: '6' },
            done: [0, 1, 2, 3, 4],
          },
        ],
        startTime: 50,
        duration: 16,
        narration:
          'Here is the while loop as a picture. We start with total zero and n at one. Each step adds the current number into total and moves n forward. When n becomes six, the condition fails and we stop with sum fifteen. Same idea as the for loop, but the stop rule lives in the condition, not in range.',
      },
      {
        type: 'quiz',
        question: 'You know you need exactly five iterations. Which loop fits best?',
        options: ['while with a manual counter', 'for over range(5)', 'Either, they are identical'],
        answerIndex: 1,
        explanation:
          'When the count is known up front, for over a range is clearer. while shines when you stop on a condition you discover as you go.',
        startTime: 66,
        duration: 10,
        narration:
          'Quick check before you write code. If you already know you need exactly five passes, which loop reads best to another human? Think about clarity, not just whether both can work.',
      },
      {
        type: 'challenge',
        language: 'python',
        prompt:
          'Write sum_to(n) that returns 1+2+…+n. Use either a for loop or a while loop — pick the one that feels clearer for a known count.',
        starterCode: 'def sum_to(n):\n    # your code here — for or while\n    pass',
        solution:
          'def sum_to(n):\n    total = 0\n    for i in range(1, n + 1):\n        total = total + i\n    return total',
        tests: [
          { expression: 'sum_to(5)', expected: '15' },
          { expression: 'sum_to(1)', expected: '1' },
          { expression: 'sum_to(0)', expected: '0' },
        ],
        hint: 'A for over range(1, n + 1) is natural when the count is known. while works too if you bump i each time.',
        concept: 'for vs while / accumulation',
        startTime: 76,
        duration: 16,
        narration:
          'Your turn. Write sum to of n that adds one through n. You may use for or while — for a known count, for is usually clearer. Three tests will check five, one, and zero. Remember range stops before the end value.',
      },
      {
        type: 'bullets',
        title: 'Takeaways',
        items: [
          'for — known sequences and ranges (end exclusive)',
          'while — stop on a condition you discover as you go',
          'Always change the loop variable — or you loop forever',
        ],
        startTime: 92,
        duration: 9,
        narration:
          'For walks known sequences, and range excludes the end. While stops on a condition. And whatever you choose, the loop variable must change — or you have written an infinite loop. That is enough to unlock most Python programs.',
      },
    ],
    'nord',
    { name: 'newani', accent: '#88c0d0' },
  );

/** Gold: JS array .map */
const JS_ARRAY_MAP = () =>
  base(
    'JavaScript array .map()',
    [
      {
        type: 'title',
        text: 'Array .map()',
        subtitle: 'transform every element',
        startTime: 0,
        duration: 3,
        narration: 'Map takes an array and builds a new one by running a function on every item. No mutating the original.',
      },
      {
        type: 'bullets',
        title: 'Goals',
        items: ['See a for-loop first', 'Replace it with .map()', 'Return a new array'],
        startTime: 3,
        duration: 6,
        narration: 'We start with a plain for loop, then morph it into map, and check that we return a brand new array.',
      },
      {
        type: 'ide',
        project: 'map-lab',
        branch: 'main',
        files: [{ path: 'map.js', language: 'javascript', code: '' }],
        steps: [
          {
            caption: 'Naive for-loop',
            action: {
              kind: 'type',
              file: 'map.js',
              code: 'const nums = [1, 2, 3];\nconst doubled = [];\nfor (let i = 0; i < nums.length; i++) {\n  doubled.push(nums[i] * 2);\n}\nconsole.log(doubled);',
              typingSpeed: 42,
            },
          },
          {
            caption: 'Same idea with .map',
            action: {
              kind: 'type',
              file: 'map.js',
              code: 'const nums = [1, 2, 3];\nconst doubled = nums.map((n) => n * 2);\nconsole.log(doubled);',
              typingSpeed: 38,
            },
          },
          {
            caption: 'Run',
            action: { kind: 'run', command: 'node map.js', output: '[ 2, 4, 6 ]' },
          },
        ],
        startTime: 9,
        duration: 18,
        narration:
          'First the classic for loop pushing into a new array. Then the same idea in one map call. Run it — two four six. The original nums is untouched.',
      },
      {
        type: 'quiz',
        question: 'What does .map return?',
        options: ['The same array, mutated', 'A new array of results', 'Only the last value'],
        answerIndex: 1,
        explanation: 'map always returns a new array; it does not mutate the source.',
        startTime: 27,
        duration: 7,
        narration: 'What does map give you back?',
      },
      {
        type: 'challenge',
        language: 'javascript',
        prompt: 'Write triple(arr) that returns each number times three using .map.',
        starterCode: 'function triple(arr) {\n  // your code here\n}\n',
        solution: 'function triple(arr) {\n  return arr.map((n) => n * 3);\n}\n',
        tests: [
          { expression: 'JSON.stringify(triple([1,2]))', expected: '[3,6]' },
          { expression: 'JSON.stringify(triple([]))', expected: '[]' },
        ],
        hint: 'Return arr.map(...)',
        concept: 'array map',
        startTime: 34,
        duration: 12,
        narration: 'Write triple that maps each number to three times itself.',
      },
      {
        type: 'bullets',
        title: 'Remember',
        items: ['.map builds a new array', 'Callback runs once per item', 'Prefer map over push loops for transforms'],
        startTime: 46,
        duration: 6,
        narration: 'Map builds a new array. The callback runs once per item. Prefer it over push loops when you are transforming.',
      },
    ],
    'midnight',
  );

/** Gold: git basics */
const GIT_BASICS = () =>
  base(
    'Git: first commit with confidence',
    [
      {
        type: 'title',
        text: 'Your first commit',
        subtitle: 'init → add → commit → status',
        startTime: 0,
        duration: 3,
        narration: 'Four commands take a folder from chaos to a saved snapshot. We will run them live in the terminal.',
      },
      {
        type: 'cli',
        title: 'zsh — ~/notes · main',
        cwd: '~/notes',
        commands: [
          { command: 'git init', output: 'Initialized empty Git repository in ~/notes/.git/', weight: 0.8 },
          { command: 'echo "hello" > README.md', output: '', weight: 0.7 },
          { command: 'git add README.md', output: '', weight: 0.8 },
          { command: 'git commit -m "first commit"', output: '[main (root-commit) a1b2c3d] first commit\n 1 file changed, 1 insertion(+)', weight: 1.2 },
          { command: 'git status', output: 'On branch main\nnothing to commit, working tree clean', weight: 1 },
        ],
        startTime: 3,
        duration: 16,
        narration:
          'Init creates the repository. We write a readme, stage it with add, freeze it with commit, and status confirms a clean tree. That is the daily loop.',
      },
      {
        type: 'bullets',
        title: 'The daily loop',
        items: ['edit files', 'git add', 'git commit', 'git status to check'],
        startTime: 19,
        duration: 6,
        narration: 'Edit, add, commit, status. Memorize that loop and you can survive any project.',
      },
      {
        type: 'quiz',
        question: 'Which command records a snapshot?',
        options: ['git add', 'git commit', 'git status'],
        answerIndex: 1,
        explanation: 'add stages; commit records the snapshot; status reports.',
        startTime: 25,
        duration: 7,
        narration: 'Which command actually records the snapshot?',
      },
    ],
    'solarized',
  );

/** Gold: REST CRUD snippet */
const REST_CRUD = () =>
  base(
    'REST: create a resource',
    [
      {
        type: 'title',
        text: 'POST creates a resource',
        subtitle: 'IDE route → API call → quiz',
        startTime: 0,
        duration: 3,
        narration: 'We will wire a create route, then call it like Postman would, and read the status code.',
      },
      {
        type: 'ide',
        project: 'todo-api',
        branch: 'feat/create',
        files: [{ path: 'app.py', language: 'python', code: '' }],
        steps: [
          {
            caption: 'POST /todos',
            action: {
              kind: 'type',
              file: 'app.py',
              code: 'from flask import Flask, request, jsonify\napp = Flask(__name__)\ntodos = []\n\n@app.post("/todos")\ndef create():\n    body = request.get_json() or {}\n    item = {"id": len(todos)+1, "text": body.get("text", "")}\n    todos.append(item)\n    return jsonify(item), 201',
              typingSpeed: 40,
            },
          },
          {
            caption: 'Highlight the status',
            action: { kind: 'highlight', file: 'app.py', startLine: 10, endLine: 10 },
          },
        ],
        startTime: 3,
        duration: 14,
        narration:
          'The route reads JSON, builds an item with a new id, appends it, and returns two oh one Created. That status is the contract.',
      },
      {
        type: 'api',
        method: 'POST',
        url: 'https://api.local/todos',
        headers: { 'Content-Type': 'application/json' },
        requestBody: '{\n  "text": "Ship CRUD"\n}',
        status: 201,
        statusText: 'Created',
        response: '{\n  "id": 1,\n  "text": "Ship CRUD"\n}',
        startTime: 17,
        duration: 10,
        narration: 'We POST the body. The server answers two oh one with the saved record including id one.',
      },
      {
        type: 'quiz',
        question: 'Successful resource creation usually returns…',
        options: ['200 OK', '201 Created', '204 No Content'],
        answerIndex: 1,
        explanation: '201 Created is the conventional success code when a new resource is born.',
        startTime: 27,
        duration: 7,
        narration: 'Which status means a new resource was created?',
      },
      {
        type: 'bullets',
        title: 'CRUD map',
        items: ['POST create → 201', 'GET read → 200', 'PUT/PATCH update', 'DELETE remove'],
        startTime: 34,
        duration: 6,
        narration: 'Post creates, get reads, put or patch updates, delete removes. Status codes tell the story.',
      },
    ],
    'midnight',
  );

export const TEMPLATES: TemplateDef[] = [
  { id: 'python-loops', label: 'Python loops', blurb: 'Title → IDE for/while → viz → quiz → challenge → recap', ready: true, build: PYTHON_LOOPS },
  { id: 'web-python-docs', label: 'Find Python docs', blurb: 'Chrome search → SERP → docs → downloads', ready: true, build: WEB_PYTHON_DOCS },
  { id: 'js-array-map', label: 'JS array .map()', blurb: 'for-loop → .map() → quiz → challenge', ready: true, build: JS_ARRAY_MAP },
  { id: 'git-basics', label: 'Git first commit', blurb: 'init → add → commit → status + quiz', ready: true, build: GIT_BASICS },
  { id: 'rest-crud', label: 'REST create', blurb: 'IDE route → API POST → quiz → CRUD map', ready: true, build: REST_CRUD },
  { id: 'ide', label: 'VS Code walkthrough', blurb: 'Full mini-lesson: bullets → IDE → quiz → recap', ready: true, build: IDE_DEMO },
  { id: 'cli', label: 'Terminal session', blurb: 'Scaffold → install → run → see it in the browser', ready: true, build: CLI_DEMO },
  { id: 'browser', label: 'Browser demo', blurb: 'Landing page sections + CTA click + quiz', ready: true, build: BROWSER_DEMO },
  { id: 'split', label: 'Code + live preview', blurb: 'HTML steps that update the preview', ready: true, build: SPLIT_DEMO },
  { id: 'layout', label: 'Side-by-side', blurb: 'Editor and browser together, then a quiz', ready: true, build: LAYOUT_DEMO },
  { id: 'api', label: 'API request', blurb: 'POST → 201 → status-code bullets → quiz', ready: true, build: API_DEMO },
  { id: 'pr', label: 'PR / diff review', blurb: 'Security fix reviewed line by line', ready: true, build: PR_DEMO },
  { id: 'diagram', label: 'Request flow', blurb: 'Sketch diagram of browser → server → DB', ready: true, build: DIAGRAM_DEMO },
  { id: 'challenge', label: 'Coding challenge', blurb: 'Prompt → hands-on function with tests', ready: true, build: CHALLENGE_DEMO },
];

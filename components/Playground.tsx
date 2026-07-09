import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, RotateCcw, X } from 'lucide-react';
import { Tok, tokenizeCode } from '@/lib/highlight';
import { BitReaction } from './BitReaction';
import type { MascotAction } from '@/lib/mascot';

// The pause-to-tinker overlay: the code the lesson is showing RIGHT NOW,
// editable and runnable. JavaScript runs in a sandboxed iframe with console
// captured; Python runs on Pyodide (loaded once from CDN, ~cached forever).
// This is the moment the "video" stops being a video — and Bit reacts to the
// learner's OWN code every time they run it (LEAP 2).

interface PlaygroundProps {
  code: string;
  language: string;
  title?: string;
  /** What the lesson is teaching — gives Bit's reactions context. */
  concept?: string;
  onClose: () => void;
}

interface Reaction { message: string; action: MascotAction; tone: 'praise' | 'nudge' | 'fix'; }

const RUNNABLE = new Set(['javascript', 'js', 'jsx', 'typescript', 'ts', 'python', 'py']);

function isPython(lang: string) {
  return lang === 'python' || lang === 'py';
}

// ── JS: sandboxed iframe, console piped back via postMessage ────────────────────
function runJS(code: string): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    const nonce = Math.random().toString(36).slice(2);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.display = 'none';

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMsg);
      iframe.remove();
      resolve(lines);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.nonce !== nonce) return;
      if (e.data.type === 'log') lines.push(String(e.data.text));
      if (e.data.type === 'done') finish();
    };
    window.addEventListener('message', onMsg);

    iframe.srcdoc = `<script>
      const nonce = ${JSON.stringify(nonce)};
      const send = (type, text) => parent.postMessage({ nonce, type, text }, '*');
      const fmt = (a) => a.map((x) => {
        try { return typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x); }
        catch { return String(x); }
      }).join(' ');
      console.log = (...a) => send('log', fmt(a));
      console.info = console.log;
      console.warn = (...a) => send('log', '⚠ ' + fmt(a));
      console.error = console.warn;
      window.onerror = (m) => { send('log', '✕ ' + m); };
      window.onunhandledrejection = (e) => { send('log', '✕ ' + (e.reason?.message || e.reason)); };
      try { eval(${JSON.stringify(code)}); } catch (e) { send('log', '✕ ' + (e && e.message ? e.message : e)); }
      setTimeout(() => send('done'), 80);
    <\/script>`;
    document.body.appendChild(iframe);

    setTimeout(finish, 4000); // runaway-loop guard
  });
}

// ── Python: Pyodide, loaded lazily from CDN and kept for the session ────────────
// URL kept in a const so the bundler leaves the dynamic import to the browser
// (same trick as kokoro-js in lib/tts.ts).
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/';
let pyodidePromise: Promise<any> | null = null;
function loadPyodide(): Promise<any> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const mod: any = await import(/* webpackIgnore: true */ `${PYODIDE_BASE}pyodide.mjs`);
      return mod.loadPyodide({ indexURL: PYODIDE_BASE });
    })();
    pyodidePromise.catch(() => { pyodidePromise = null; });
  }
  return pyodidePromise;
}

async function runPython(code: string, onStatus: (s: string) => void): Promise<string[]> {
  const lines: string[] = [];
  onStatus('loading python (first run only)…');
  const py = await loadPyodide();
  onStatus('');
  py.setStdout({ batched: (s: string) => lines.push(s) });
  py.setStderr({ batched: (s: string) => lines.push('⚠ ' + s) });
  try {
    await py.runPythonAsync(code);
  } catch (e: any) {
    // surface just the final error line — the full traceback drowns beginners
    const msg = String(e?.message || e);
    const last = msg.trim().split('\n').filter(Boolean).pop() || msg;
    lines.push('✕ ' + last);
  }
  return lines;
}

// ── Component ───────────────────────────────────────────────────────────────────
export function Playground({ code: initial, language, title, concept, onClose }: PlaygroundProps) {
  const [code, setCode] = useState(initial);
  const [out, setOut] = useState<string[] | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [toks, setToks] = useState<Tok[][]>([]);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [reacting, setReacting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const lang = language.toLowerCase();
  const canRun = RUNNABLE.has(lang);

  // syntax underlay (debounced against fast typing)
  useEffect(() => {
    const t = setTimeout(() => {
      tokenizeCode(code, language).then(setToks).catch(() => {});
    }, 90);
    return () => clearTimeout(t);
  }, [code, language]);

  const syncScroll = useCallback(() => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }, []);

  // Bit reacts to what the learner just ran (their code + real output)
  const reactToRun = useCallback(async (outputText: string) => {
    setReacting(true);
    setReaction(null);
    try {
      const res = await fetch('/api/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: concept || title, starterCode: initial, learnerCode: code, output: outputText, language }),
      });
      const data = await res.json();
      if (data && data.message) setReaction({ message: data.message, action: data.action, tone: data.tone });
    } catch {
      // silent — a missing reaction shouldn't disrupt tinkering
    } finally {
      setReacting(false);
    }
  }, [concept, title, initial, code, language]);

  const run = useCallback(async () => {
    if (running || !canRun) return;
    setRunning(true);
    setOut(null);
    setReaction(null);
    try {
      const lines = isPython(lang) ? await runPython(code, setStatus) : await runJS(code);
      const shown = lines.length ? lines : ['(no output)'];
      setOut(shown);
      reactToRun(shown.join('\n'));
    } catch (e) {
      const msg = '✕ ' + (e instanceof Error ? e.message : 'run failed');
      setOut([msg]);
      reactToRun(msg);
    } finally {
      setRunning(false);
      setStatus('');
    }
  }, [code, lang, canRun, running, reactToRun]);

  // cmd/ctrl+enter runs, esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, run]);

  useEffect(() => { taRef.current?.focus(); }, []);

  const lineCount = useMemo(() => code.split('\n').length, [code]);

  return (
    <div className="pg" onClick={(e) => e.stopPropagation()}>
      <header className="head">
        <span className="dot" />
        <span className="ttl">playground · {title || language}</span>
        <span className="hint">edit the lesson&apos;s code, then run it — this is your copy</span>
        <span className="grow" />
        <button className="btn ghost" onClick={() => { setCode(initial); setOut(null); }}>
          <RotateCcw size={13} /> reset
        </button>
        {canRun ? (
          <button className="btn run" onClick={run} disabled={running}>
            {running ? <Loader2 size={13} className="spin" /> : <Play size={13} fill="currentColor" />}
            run <kbd>⌘↵</kbd>
          </button>
        ) : (
          <span className="norun">{language} can&apos;t run in the browser yet</span>
        )}
        <button className="btn ghost" onClick={onClose}>
          <X size={14} /> back to lesson
        </button>
      </header>

      <div className="body">
        <div className="editor">
          <div className="gutter">
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <div className="stack">
            <pre ref={preRef} aria-hidden className="under">
              {toks.map((line, i) => (
                <div key={i} className="ln">
                  {line.length ? line.map((t, j) => (
                    <span key={j} style={{ color: t.color }}>{t.text}</span>
                  )) : ' '}
                </div>
              ))}
            </pre>
            <textarea
              ref={taRef}
              value={code}
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
              onScroll={syncScroll}
            />
          </div>
        </div>

        <div className="outwrap">
          <div className="outhead">
            <span className="prompt">❯</span> output
            {status && <span className="status">{status}</span>}
          </div>
          <pre className="out">
            {out === null
              ? running ? 'running…' : canRun ? 'hit run to execute your copy' : ''
              : out.join('\n')}
          </pre>
        </div>
      </div>

      {(reacting || reaction) && (
        <div className="reaction">
          <BitReaction
            action={reaction?.action || 'think'}
            tone={reaction?.tone || 'nudge'}
            message={reaction?.message || ''}
            loading={reacting && !reaction}
            onDismiss={() => setReaction(null)}
          />
        </div>
      )}

      <style jsx>{`
        .pg {
          position: absolute; inset: 0; z-index: 30;
          display: flex; flex-direction: column;
          background: rgba(9, 9, 14, 0.97); backdrop-filter: blur(14px);
          animation: pgin 0.22s ease both;
        }
        @keyframes pgin { from { opacity: 0; transform: scale(0.985); } }

        .head {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px; border-bottom: 1px solid var(--line);
          font-size: 12.5px;
        }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); }
        .ttl { font-weight: 700; color: var(--fg); }
        .hint { color: var(--dimmer); font-size: 11.5px; }
        .grow { flex: 1; }
        .btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 13px; border-radius: 8px; cursor: pointer;
          font: inherit; font-size: 12px; border: 1px solid var(--line);
          background: transparent; color: var(--dim);
          transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
        }
        .btn:hover { color: var(--fg); border-color: var(--line-strong); }
        .btn.run {
          background: rgba(52, 211, 153, 0.14); border-color: rgba(52, 211, 153, 0.4); color: var(--green);
          font-weight: 700;
        }
        .btn.run:hover { background: rgba(52, 211, 153, 0.22); }
        .btn.run:disabled { opacity: 0.5; cursor: default; }
        .btn kbd { font-size: 10px; opacity: 0.6; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; }
        .norun { font-size: 11.5px; color: var(--dimmer); }

        .body { flex: 1; display: grid; grid-template-columns: 1.6fr 1fr; min-height: 0; }
        .editor { display: flex; min-width: 0; border-right: 1px solid var(--line); }
        .gutter {
          display: flex; flex-direction: column; padding: 18px 0 18px 16px;
          font-size: 13.5px; line-height: 1.65; color: var(--dimmer); text-align: right;
          user-select: none; min-width: 34px;
        }
        .stack { position: relative; flex: 1; min-width: 0; }
        .under, .stack textarea {
          position: absolute; inset: 0;
          margin: 0; padding: 18px 18px 18px 14px;
          font-family: var(--mono); font-size: 13.5px; line-height: 1.65;
          white-space: pre; overflow: auto; tab-size: 4;
        }
        .under { pointer-events: none; color: #e4e4e7; }
        .under .ln { min-height: 1.65em; }
        .stack textarea {
          background: transparent; border: none; outline: none; resize: none;
          color: transparent; caret-color: var(--accent);
        }
        .stack textarea::selection { background: rgba(167, 139, 250, 0.28); }

        .outwrap { display: flex; flex-direction: column; min-width: 0; background: #0b0d10; }
        .outhead {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 16px; font-size: 11.5px; color: var(--dim);
          border-bottom: 1px solid var(--line);
        }
        .prompt { color: var(--accent); }
        .status { color: var(--dimmer); margin-left: auto; }
        .out {
          flex: 1; margin: 0; padding: 16px;
          font-family: var(--mono); font-size: 13px; line-height: 1.7;
          color: #7ee2a8; overflow: auto; white-space: pre-wrap;
        }
        :global(.spin) { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .reaction {
          position: absolute; left: 18px; bottom: 18px; z-index: 20;
          pointer-events: none;
        }

        @media (max-width: 860px) {
          .body { grid-template-columns: 1fr; grid-template-rows: 1.5fr 1fr; }
          .editor { border-right: none; border-bottom: 1px solid var(--line); }
          .reaction { left: 10px; bottom: 10px; }
        }
      `}</style>
    </div>
  );
}

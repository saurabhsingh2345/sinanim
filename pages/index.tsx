import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import {
  Sparkles,
  Loader2,
  Circle,
  Copy,
  Check,
  Wand2,
  Film,
  Code2,
  AlertTriangle,
} from 'lucide-react';
import { AnimationDSL } from '@/lib/types';
import { normalizeDSL } from '@/lib/dsl';
import { Stage } from '@/components/Stage';

const EXAMPLES = [
  'A Python hello world: type the function, click Run, show the output',
  'JavaScript array .map() example with the console result',
  'A React useState counter component being typed out',
  'Bash: git init, git add, git commit walkthrough',
  'A SQL SELECT query with a JOIN and its result table',
];

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [dsl, setDsl] = useState<AnimationDSL | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [providerLabel, setProviderLabel] = useState('');
  const [hint, setHint] = useState('');
  const [tab, setTab] = useState<'preview' | 'dsl'>('preview');
  const [editorText, setEditorText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models || []);
        setModel(d.default || '');
        setOnline(!!d.online);
        setProviderLabel(d.label || '');
        setHint(d.hint || '');
      })
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    if (dsl) setEditorText(JSON.stringify(dsl, null, 2));
  }, [dsl]);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/generate-dsl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setDsl(data.dsl);
      setTab('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const applyEditor = () => {
    try {
      setDsl(normalizeDSL(JSON.parse(editorText)));
      setError('');
      setTab('preview');
    } catch (e) {
      setError('Invalid DSL: ' + (e instanceof Error ? e.message : 'parse error'));
    }
  };

  const copyDsl = () => {
    navigator.clipboard.writeText(editorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const statusLabel = useMemo(() => {
    const name = providerLabel || 'llm';
    if (online === null) return 'connecting…';
    return online ? `${name} · online` : `${name} · offline`;
  }, [online, providerLabel]);

  return (
    <>
      <Head>
        <title>MOTION.dsl — prompt → code animation</title>
      </Head>

      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="glyph">◐</span>
            <span className="name">MOTION<span className="dot">.dsl</span></span>
            <span className="tag">open-source code-animation engine</span>
          </div>
          <div className="topright">
            <div className={`status ${online ? 'on' : online === false ? 'off' : ''}`}>
              <Circle size={9} className="statusdot" fill="currentColor" />
              {statusLabel}
            </div>
            <select
              className="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!models.length}
            >
              {models.length ? (
                models.map((m) => <option key={m} value={m}>{m}</option>)
              ) : (
                <option>no models</option>
              )}
            </select>
          </div>
        </header>

        <main className="grid">
          {/* ── Console ─────────────────────────────── */}
          <section className="console">
            <label className="lbl"><Wand2 size={14} /> describe the video</label>
            <textarea
              className="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
              }}
              placeholder="e.g. A Python hello world — type the function, click Run, show 'Hello World' in the terminal, caption it."
              spellCheck={false}
            />

            <button className="generate" onClick={generate} disabled={loading || !prompt.trim()}>
              {loading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {loading ? 'compiling animation…' : 'Generate animation'}
              <kbd>⌘⏎</kbd>
            </button>

            {online === false && hint && (
              <div className="warn">
                <AlertTriangle size={14} />
                <div>{hint}</div>
              </div>
            )}
            {error && <div className="err">{error}</div>}

            <div className="examples">
              <span className="exlbl">try a prompt</span>
              {EXAMPLES.map((ex) => (
                <button key={ex} className="chip" onClick={() => setPrompt(ex)}>
                  {ex}
                </button>
              ))}
            </div>

            <ol className="steps">
              <li><b>01</b> local model writes an animation timeline (DSL)</li>
              <li><b>02</b> the canvas renders it deterministically, with sound</li>
              <li><b>03</b> export a clean video — no screen recording</li>
            </ol>
          </section>

          {/* ── Stage / DSL ─────────────────────────── */}
          <section className="workspace">
            {dsl ? (
              <>
                <div className="tabs">
                  <button className={tab === 'preview' ? 'tab on' : 'tab'} onClick={() => setTab('preview')}>
                    <Film size={14} /> preview
                  </button>
                  <button className={tab === 'dsl' ? 'tab on' : 'tab'} onClick={() => setTab('dsl')}>
                    <Code2 size={14} /> dsl
                  </button>
                  <span className="meta">
                    {dsl.scenes.length} scenes · {dsl.duration.toFixed(1)}s · {dsl.fps}fps
                  </span>
                  <button className="copy" onClick={copyDsl}>
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'copied' : 'copy dsl'}
                  </button>
                </div>

                {tab === 'preview' ? (
                  <Stage dsl={dsl} />
                ) : (
                  <div className="editor">
                    <textarea
                      value={editorText}
                      onChange={(e) => setEditorText(e.target.value)}
                      spellCheck={false}
                    />
                    <button className="apply" onClick={applyEditor}>
                      apply changes → re-render
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="empty">
                <div className="empty-inner">
                  <span className="empty-glyph">◐</span>
                  <p className="empty-title">no animation yet</p>
                  <p className="empty-sub">
                    write a prompt and hit generate — your preview renders here,
                    ready to export.
                  </p>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <style jsx>{`
        .app { max-width: 1500px; margin: 0 auto; padding: 22px clamp(16px, 3vw, 40px) 60px; }
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding-bottom: 20px; margin-bottom: 26px;
          border-bottom: 1px solid var(--line); flex-wrap: wrap;
        }
        .brand { display: flex; align-items: baseline; gap: 12px; }
        .glyph { color: var(--pink); font-size: 22px; transform: translateY(2px); }
        .name { font-weight: 800; font-size: 20px; letter-spacing: -0.5px; }
        .dot { color: var(--cyan); }
        .tag { color: var(--dimmer); font-size: 12px; letter-spacing: 0.2px; }
        .topright { display: flex; align-items: center; gap: 12px; }
        .status {
          display: inline-flex; align-items: center; gap: 7px; font-size: 12px;
          color: var(--dim); padding: 6px 12px; border: 1px solid var(--line);
          border-radius: 999px;
        }
        .status .statusdot { color: var(--dimmer); }
        .status.on { color: var(--green); } .status.on .statusdot { color: var(--green); }
        .status.off { color: var(--pink); } .status.off .statusdot { color: var(--pink); }
        .model {
          appearance: none; background: var(--panel); color: var(--fg);
          border: 1px solid var(--line); border-radius: 9px; padding: 7px 12px;
          font: inherit; font-size: 12px; cursor: pointer;
        }

        .grid { display: grid; grid-template-columns: 400px 1fr; gap: 26px; align-items: start; }
        @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }

        .console { display: flex; flex-direction: column; gap: 14px; }
        .lbl { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--dim); }
        .prompt {
          width: 100%; min-height: 150px; resize: vertical; background: var(--panel);
          color: var(--fg); border: 1px solid var(--line); border-radius: 12px;
          padding: 16px; font: inherit; font-size: 14px; line-height: 1.6;
        }
        .prompt::placeholder { color: var(--dimmer); }
        .prompt:focus { outline: none; border-color: var(--line-strong); }

        .generate {
          display: inline-flex; align-items: center; gap: 10px; justify-content: center;
          padding: 14px 18px; border: none; border-radius: 12px; cursor: pointer;
          font: inherit; font-size: 14px; font-weight: 600; color: #14040a;
          background: linear-gradient(120deg, var(--pink), #ffb199 60%, var(--cyan));
          background-size: 160% 100%; transition: background-position .4s ease, filter .2s;
        }
        .generate:hover:not(:disabled) { background-position: 100% 0; }
        .generate:disabled { opacity: .5; cursor: not-allowed; }
        .generate kbd {
          margin-left: 4px; font-size: 11px; background: rgba(0,0,0,0.25);
          padding: 2px 6px; border-radius: 5px; color: #2a0a12;
        }

        .warn, .err {
          display: flex; gap: 10px; font-size: 12.5px; line-height: 1.5;
          padding: 12px 14px; border-radius: 10px;
        }
        .warn { color: var(--yellow); border: 1px solid rgba(251,191,36,0.3); background: rgba(251,191,36,0.06); }
        .warn code { color: var(--fg); background: rgba(255,255,255,0.07); padding: 1px 6px; border-radius: 5px; }
        .err { color: #fca5a5; border: 1px solid rgba(248,113,113,0.3); background: rgba(248,113,113,0.07); }

        .examples { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
        .exlbl { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--dimmer); }
        .chip {
          text-align: left; background: transparent; color: var(--dim);
          border: 1px solid var(--line); border-radius: 9px; padding: 9px 12px;
          font: inherit; font-size: 12.5px; cursor: pointer; transition: all .15s;
        }
        .chip:hover { color: var(--fg); border-color: var(--cyan); background: rgba(34,211,238,0.05); }

        .steps { list-style: none; margin-top: 8px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 16px; }
        .steps li { font-size: 12px; color: var(--dim); }
        .steps b { color: var(--cyan); margin-right: 8px; }

        .workspace { min-width: 0; }
        .tabs { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
        .tab {
          display: inline-flex; align-items: center; gap: 7px; background: transparent;
          color: var(--dim); border: 1px solid var(--line); border-radius: 9px;
          padding: 8px 13px; font: inherit; font-size: 12.5px; cursor: pointer;
        }
        .tab.on { color: var(--fg); border-color: var(--line-strong); background: var(--panel); }
        .meta { margin-left: 6px; font-size: 11.5px; color: var(--dimmer); }
        .copy {
          margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--dim); border: 1px solid var(--line);
          border-radius: 9px; padding: 8px 12px; font: inherit; font-size: 12px; cursor: pointer;
        }
        .copy:hover { color: var(--fg); }

        .editor { display: flex; flex-direction: column; gap: 12px; }
        .editor textarea {
          width: 100%; min-height: 60vh; background: var(--panel); color: #c8d3de;
          border: 1px solid var(--line); border-radius: 12px; padding: 18px;
          font: inherit; font-size: 12.5px; line-height: 1.6; resize: vertical; white-space: pre;
        }
        .editor textarea:focus { outline: none; border-color: var(--line-strong); }
        .apply {
          align-self: flex-start; background: var(--panel); color: var(--green);
          border: 1px solid rgba(52,211,153,0.4); border-radius: 9px; padding: 10px 16px;
          font: inherit; font-size: 13px; cursor: pointer;
        }
        .apply:hover { background: rgba(52,211,153,0.08); }

        .empty {
          border: 1px dashed var(--line-strong); border-radius: 16px;
          min-height: 62vh; display: grid; place-items: center; text-align: center;
          background:
            radial-gradient(30rem 20rem at 50% 30%, rgba(255,123,156,0.05), transparent 70%);
        }
        .empty-glyph { font-size: 56px; color: var(--pink); opacity: 0.5; display: block; margin-bottom: 18px; animation: float 5s ease-in-out infinite; }
        .empty-title { font-size: 16px; color: var(--fg); }
        .empty-sub { font-size: 13px; color: var(--dim); max-width: 340px; margin: 10px auto 0; line-height: 1.6; }
        @keyframes float { 50% { transform: translateY(-10px) rotate(8deg); } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

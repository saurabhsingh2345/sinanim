import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Lightbulb, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { ChallengeScene } from '@/lib/types';
import type { GradeResult } from '@/lib/grade';
import type { MascotAction } from '@/lib/mascot';
import { BitReaction } from './BitReaction';
import { cx } from '@/lib/utils';

// LEAP 3 — a real coding challenge. The learner writes code and it's RUN against
// tests; they advance on mastery, not a click. Bit reacts to their attempt.

interface ChallengeCardProps {
  scene: ChallengeScene;
  onPass: (firstTry: boolean) => void;
  onSkip: () => void;
}

export function ChallengeCard({ scene, onPass, onSkip }: ChallengeCardProps) {
  const [code, setCode] = useState(scene.starterCode || '');
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [reaction, setReaction] = useState<{ message: string; action: MascotAction; tone: 'praise' | 'nudge' | 'fix' } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const passed = !!result?.allPass;
  const lineCount = useMemo(() => code.split('\n').length, [code]);

  useEffect(() => { taRef.current?.focus(); }, []);

  const check = useCallback(async () => {
    if (grading) return;
    setGrading(true);
    setReaction(null);
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: scene.language, code, tests: scene.tests }),
      });
      const data: GradeResult = await res.json();
      setResult(data);
      const n = attempts + 1;
      setAttempts(n);
      if (data.allPass) {
        setReaction({ message: n === 1 ? 'First try — beautifully done!' : 'You got it! Every test passes.', action: 'celebrate', tone: 'praise' });
      } else if (data.error) {
        setReaction({ message: `Your code hit an error: ${data.error}`, action: 'think', tone: 'fix' });
      } else {
        const failed = data.results.find((r) => !r.pass);
        setReaction({
          message: failed
            ? `Close! ${failed.expression} gave ${failed.actual || 'nothing'}, but should give ${failed.expected}.`
            : "Not quite yet — check the failing test.",
          action: 'point', tone: 'nudge',
        });
      }
    } catch {
      setReaction({ message: "Couldn't run that — check your syntax and try again.", action: 'think', tone: 'fix' });
    } finally {
      setGrading(false);
    }
  }, [grading, scene, code, attempts]);

  // cmd/ctrl+enter checks
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); check(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [check]);

  return (
    <div className="cc" onClick={(e) => e.stopPropagation()}>
      <div className="panel">
        <header>
          <span className="eyebrow">◆ YOUR TURN</span>
          <span className="tests">{scene.tests.length} tests</span>
          <button className="skip" onClick={onSkip}>skip <X size={13} /></button>
        </header>

        <p className="prompt">{scene.prompt}</p>

        <div className="editor">
          <div className="gutter">
            {Array.from({ length: lineCount }, (_, i) => <span key={i}>{i + 1}</span>)}
          </div>
          <textarea
            ref={taRef}
            value={showSolution ? scene.solution : code}
            spellCheck={false}
            onChange={(e) => { setShowSolution(false); setCode(e.target.value); }}
          />
        </div>

        {result && !passed && (
          <div className="results">
            {result.results.map((r, i) => (
              <div key={i} className={cx('trow', r.pass && 'ok')}>
                <span className="tsym">{r.pass ? '✓' : '✕'}</span>
                <code>{r.expression}</code>
                {!r.pass && <span className="exp">→ {r.actual || '—'} <em>(want {r.expected})</em></span>}
              </div>
            ))}
          </div>
        )}

        <footer>
          {scene.hint && !passed && (
            <button className="ghost" onClick={() => setShowHint((h) => !h)}>
              <Lightbulb size={14} /> {showHint ? 'hide hint' : 'hint'}
            </button>
          )}
          {attempts >= 2 && !passed && scene.solution && (
            <button className="ghost" onClick={() => setShowSolution((s) => !s)}>
              <RotateCcw size={13} /> {showSolution ? 'my code' : 'show solution'}
            </button>
          )}
          <span className="grow" />
          {passed ? (
            <button className="cont" onClick={() => onPass(attempts <= 1)}>
              continue <ArrowRight size={15} />
            </button>
          ) : (
            <button className="check" onClick={check} disabled={grading}>
              {grading ? <Loader2 size={14} className="spin" /> : <Play size={14} fill="currentColor" />}
              check <kbd>⌘↵</kbd>
            </button>
          )}
        </footer>

        {showHint && scene.hint && <p className="hint">{scene.hint}</p>}
        {passed && <div className="passbanner"><Check size={16} /> all {result!.total} tests pass</div>}
      </div>

      {reaction && (
        <div className="react">
          <BitReaction action={reaction.action} tone={reaction.tone} message={reaction.message} onDismiss={() => setReaction(null)} />
        </div>
      )}

      <style jsx>{`
        .cc {
          position: absolute; inset: 0; z-index: 25;
          display: grid; place-items: center;
          background: rgba(9, 9, 14, 0.72); backdrop-filter: blur(6px);
          animation: fade 0.2s ease both;
        }
        @keyframes fade { from { opacity: 0; } }
        .panel {
          width: min(72%, 900px); max-height: 88%;
          display: flex; flex-direction: column; gap: 12px;
          padding: 22px 24px; border-radius: 18px;
          background: #15151d; border: 1px solid var(--line-strong);
          box-shadow: 0 40px 90px -30px rgba(0, 0, 0, 0.9);
        }
        header { display: flex; align-items: center; gap: 12px; }
        .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: var(--green); }
        .tests { font-size: 11px; color: var(--dimmer); }
        .skip {
          margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
          background: none; border: none; color: var(--dimmer); font: inherit; font-size: 12px; cursor: pointer;
        }
        .skip:hover { color: var(--fg); }
        .prompt { font-size: 16px; font-weight: 600; line-height: 1.45; color: var(--fg); }

        .editor { display: flex; min-height: 150px; max-height: 300px; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); background: #0e0e14; }
        .gutter {
          display: flex; flex-direction: column; padding: 12px 0 12px 12px;
          font: 13px/1.6 var(--mono); color: var(--dimmer); text-align: right; user-select: none; min-width: 30px;
        }
        .editor textarea {
          flex: 1; padding: 12px 14px; resize: none; border: none; outline: none;
          background: transparent; color: #e4e4e7; caret-color: var(--accent);
          font: 13px/1.6 var(--mono); tab-size: 4; white-space: pre; overflow: auto;
        }

        .results { display: flex; flex-direction: column; gap: 5px; max-height: 120px; overflow: auto; }
        .trow { display: flex; align-items: baseline; gap: 8px; font: 12.5px/1.5 var(--mono); color: #fca5a5; }
        .trow.ok { color: var(--green); }
        .tsym { width: 12px; flex: none; }
        .trow code { color: var(--fg); }
        .trow .exp { color: var(--dim); }
        .trow .exp em { color: var(--dimmer); font-style: normal; }

        footer { display: flex; align-items: center; gap: 8px; }
        .grow { flex: 1; }
        .ghost {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 11px; border-radius: 8px; border: 1px solid var(--line);
          background: transparent; color: var(--dim); font: inherit; font-size: 12px; cursor: pointer;
        }
        .ghost:hover { color: var(--fg); border-color: var(--line-strong); }
        .check, .cont {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: 9px; border: none; cursor: pointer;
          font: inherit; font-size: 13px; font-weight: 700;
        }
        .check { background: rgba(167, 139, 250, 0.16); border: 1px solid rgba(167, 139, 250, 0.5); color: var(--accent); }
        .check:hover { background: rgba(167, 139, 250, 0.26); }
        .check:disabled { opacity: 0.5; cursor: default; }
        .check kbd { font-size: 10px; opacity: 0.6; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; }
        .cont { background: linear-gradient(180deg, #4ade80, #22c55e); color: #052e16; }
        .cont:hover { filter: brightness(1.06); }
        .hint { font-size: 13px; line-height: 1.5; color: var(--dim); padding: 10px 12px; border-radius: 8px; background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(251, 191, 36, 0.25); }
        .passbanner { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; font-size: 12.5px; font-weight: 700; color: var(--green); }

        .react { position: absolute; left: 24px; bottom: 24px; z-index: 26; pointer-events: none; }
        :global(.spin) { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

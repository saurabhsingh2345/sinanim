import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Sparkles,
  Loader2,
  Circle,
  GraduationCap,
  Clapperboard,
  AlertTriangle,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { AnimationDSL } from '@/lib/types';
import { CourseOutline } from '@/lib/course';
import { Player } from '@/components/Player';
import { createCourse, deleteCourse, getCourse, listCourses, courseCompletion } from '@/lib/store';
import { allCards, dueConcepts, masteryOf } from '@/lib/mastery';

const COURSE_EXAMPLES = [
  'Python for absolute beginners, ending with a small CLI tool',
  'Practical git: from first commit to fixing mistakes with confidence',
  'JavaScript async: callbacks → promises → async/await',
  'SQL from zero: selects, joins and aggregations on a real dataset',
];

const VIDEO_EXAMPLES = [
  'A narrated Python f-strings tutorial: start simple, then evolve the code with format specifiers',
  'Teach JavaScript array .map(): show a for-loop first, then diff it into .map()',
  'A React useState counter with voiceover, ending with the functional-update form',
  'Explain how an HTTP request flows from browser to database, with a diagram',
];

type Mode = 'course' | 'video';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('course');
  const [prompt, setPrompt] = useState('');
  const [dsl, setDsl] = useState<AnimationDSL | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [providerLabel, setProviderLabel] = useState('');
  const [hint, setHint] = useState('');
  const [courses, setCourses] = useState<CourseOutline[]>([]);
  const [completion, setCompletion] = useState<Record<string, number>>({});

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

  const refreshShelf = useCallback(() => {
    const list = listCourses();
    setCourses(list);
    const comp: Record<string, number> = {};
    for (const c of list) {
      const full = getCourse(c.id);
      if (full) comp[c.id] = courseCompletion(full);
    }
    setCompletion(comp);
  }, []);
  useEffect(() => { refreshShelf(); }, [refreshShelf]);

  // learner model: concepts the FSRS model says are worth revisiting
  const [review, setReview] = useState<{ concept: string; mastery: number }[]>([]);
  useEffect(() => {
    const due = new Set(dueConcepts().map((c) => c.concept));
    const items = allCards()
      .map((c) => ({ concept: c.concept, mastery: masteryOf(c.concept), due: due.has(c.concept) }))
      .filter((c) => c.due || c.mastery < 0.65)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 8);
    setReview(items);
  }, []);

  // authoring is a multi-pass pipeline (~20-30s); rotate the label so the wait
  // clearly progresses instead of looking frozen
  const LESSON_STAGES = ['scripting the lesson…', 'reviewing the code…', 'writing the voiceover…', 'polishing checkpoints…', 'almost there…'];
  const COURSE_STAGES = ['planning the modules…', 'sequencing lessons…', 'writing objectives…', 'almost there…'];
  useEffect(() => {
    if (!loading) { setStage(0); return; }
    const steps = mode === 'course' ? COURSE_STAGES : LESSON_STAGES;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, steps.length - 1)), 5500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mode]);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      if (mode === 'course') {
        const res = await fetch('/api/generate-course', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Course design failed');
        const stored = createCourse(data.outline);
        router.push(`/course/${stored.outline.id}`);
        return; // keep the spinner until navigation
      }
      const res = await fetch('/api/generate-dsl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setDsl(data.dsl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      if (mode !== 'course') setLoading(false);
      else setLoading(false);
    }
  };

  const removeCourse = (id: string) => {
    deleteCourse(id);
    refreshShelf();
  };

  const statusLabel = useMemo(() => {
    const name = providerLabel || 'llm';
    if (online === null) return 'connecting…';
    return online ? `${name} · online` : `${name} · offline`;
  }, [online, providerLabel]);

  const examples = mode === 'course' ? COURSE_EXAMPLES : VIDEO_EXAMPLES;

  return (
    <>
      <Head>
        <title>newani — type a topic, get a narrated course</title>
      </Head>

      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="glyph">◆</span>
            <span className="name">newani</span>
            <span className="studio">studio</span>
          </div>
          <div className="topright">
            <div className={`status ${online ? 'on' : online === false ? 'off' : ''}`}>
              <Circle size={8} className="statusdot" fill="currentColor" />
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

        <main className="hero">
          <h1>
            Type a topic.<br />
            Get a <em>narrated course</em>.
          </h1>
          <p className="sub">
            Scripting, screen-recording, editing and voiceover — replaced by one prompt.
            Watchable lessons with typed code, quiz checkpoints and a free local voice.
          </p>

          <div className="modes">
            <button className={mode === 'course' ? 'mode on' : 'mode'} onClick={() => setMode('course')}>
              <GraduationCap size={15} /> full course
            </button>
            <button className={mode === 'video' ? 'mode on' : 'mode'} onClick={() => setMode('video')}>
              <Clapperboard size={15} /> single lesson
            </button>
          </div>

          <div className="promptbox">
            <textarea
              className="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
              }}
              placeholder={
                mode === 'course'
                  ? 'What do you want to teach? e.g. "Python decorators for working developers"'
                  : 'Describe one lesson, e.g. "Teach list comprehensions: loop first, then diff it into a comprehension"'
              }
              spellCheck={false}
              rows={3}
            />
            <button className="generate" onClick={generate} disabled={loading || !prompt.trim()}>
              {loading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              {loading
                ? (mode === 'course' ? COURSE_STAGES : LESSON_STAGES)[stage]
                : mode === 'course' ? 'Build course' : 'Make lesson'}
              <kbd>⌘⏎</kbd>
            </button>
          </div>

          {online === false && hint && (
            <div className="warn"><AlertTriangle size={14} /><div>{hint}</div></div>
          )}
          {error && <div className="err">{error}</div>}

          <div className="examples">
            {examples.map((ex) => (
              <button key={ex} className="chip" onClick={() => setPrompt(ex)}>{ex}</button>
            ))}
          </div>
        </main>

        {mode === 'video' && dsl && (
          <section className="result">
            <Player dsl={dsl} />
          </section>
        )}

        {review.length > 0 && (
          <section className="review">
            <h2>worth revisiting</h2>
            <p className="rsub">Your progress is remembered across every lesson. These concepts have faded — generate a lesson to strengthen them.</p>
            <div className="rchips">
              {review.map((r) => (
                <button key={r.concept} className="rchip" onClick={() => { setMode('video'); setPrompt(`A focused refresher on ${r.concept}, with a hands-on challenge.`); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <span className="rdot" style={{ background: `hsl(${r.mastery * 120}, 70%, 55%)` }} />
                  {r.concept}
                  <em>{Math.round(r.mastery * 100)}%</em>
                </button>
              ))}
            </div>
          </section>
        )}

        {courses.length > 0 && (
          <section className="shelf">
            <h2>your courses</h2>
            <div className="cards">
              {courses.map((c) => (
                <div className="card" key={c.id}>
                  <Link href={`/course/${c.id}`} className="cardlink">
                    <span className="cardtitle">{c.title}</span>
                    <span className="carddesc">{c.description}</span>
                    <span className="bar"><span className="barfill" style={{ width: `${(completion[c.id] || 0) * 100}%` }} /></span>
                    <span className="cardmeta">
                      {c.modules.reduce((a, m) => a + m.lessons.length, 0)} lessons
                      <ArrowRight size={13} />
                    </span>
                  </Link>
                  <button className="del" onClick={() => removeCourse(c.id)} aria-label="Delete course">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="foot">
          <span>voice: Kokoro TTS, synthesized locally · models: {providerLabel || '—'} · everything exports to MP4</span>
        </footer>
      </div>

      <style jsx>{`
        .app { max-width: 1200px; margin: 0 auto; padding: 22px clamp(16px, 3vw, 40px) 60px; }
        .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .brand { display: flex; align-items: baseline; gap: 9px; }
        .glyph { color: var(--accent); font-size: 16px; }
        .name { font-weight: 800; font-size: 19px; letter-spacing: -0.5px; }
        .studio {
          font-size: 10.5px; letter-spacing: 2.5px; text-transform: uppercase;
          color: var(--accent); border: 1px solid rgba(167, 139, 250, 0.35);
          padding: 3px 8px; border-radius: 999px; transform: translateY(-2px);
        }
        .topright { display: flex; align-items: center; gap: 12px; }
        .status {
          display: inline-flex; align-items: center; gap: 7px; font-size: 12px;
          color: var(--dim); padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px;
        }
        .status .statusdot { color: var(--dimmer); }
        .status.on { color: var(--green); } .status.on .statusdot { color: var(--green); }
        .status.off { color: #fca5a5; } .status.off .statusdot { color: #fca5a5; }
        .model {
          appearance: none; background: var(--panel); color: var(--fg);
          border: 1px solid var(--line); border-radius: 9px; padding: 7px 12px;
          font: inherit; font-size: 12px; cursor: pointer; max-width: 240px;
        }

        .hero { margin: 72px auto 0; max-width: 760px; text-align: center; }
        h1 {
          font-size: clamp(34px, 5.5vw, 54px); line-height: 1.1; letter-spacing: -1.5px;
          font-weight: 800;
        }
        h1 em {
          font-style: normal; color: var(--accent);
          text-shadow: 0 0 46px rgba(139, 92, 246, 0.45);
        }
        .sub { margin: 20px auto 0; max-width: 560px; color: var(--dim); font-size: 14px; line-height: 1.7; }

        .modes { display: inline-flex; gap: 4px; margin-top: 34px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
        .mode {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 16px; border: none; border-radius: 9px;
          background: transparent; color: var(--dim); font: inherit; font-size: 13px; cursor: pointer;
          transition: all 0.15s ease;
        }
        .mode.on { background: rgba(167, 139, 250, 0.13); color: var(--accent); }

        .promptbox {
          margin-top: 18px; display: flex; flex-direction: column; gap: 0;
          border: 1px solid var(--line-strong); border-radius: 16px; overflow: hidden;
          background: var(--panel);
          box-shadow: 0 30px 70px -40px rgba(139, 92, 246, 0.35);
          text-align: left;
        }
        .promptbox:focus-within { border-color: rgba(167, 139, 250, 0.55); }
        .prompt {
          width: 100%; resize: none; background: transparent; color: var(--fg);
          border: none; padding: 18px 18px 10px; font: inherit; font-size: 14.5px; line-height: 1.6;
        }
        .prompt::placeholder { color: var(--dimmer); }
        .prompt:focus { outline: none; }
        .generate {
          display: inline-flex; align-items: center; gap: 10px; justify-content: center;
          margin: 10px; padding: 13px 18px; border: none; border-radius: 11px; cursor: pointer;
          font: inherit; font-size: 14px; font-weight: 700; color: #16103a;
          background: linear-gradient(120deg, #c4b5fd, var(--accent) 55%, #8b5cf6);
          transition: filter 0.15s ease;
        }
        .generate:hover:not(:disabled) { filter: brightness(1.07); }
        .generate:disabled { opacity: 0.45; cursor: not-allowed; }
        .generate kbd { margin-left: 4px; font-size: 11px; background: rgba(0, 0, 0, 0.22); padding: 2px 6px; border-radius: 5px; }

        .warn, .err {
          display: flex; gap: 10px; font-size: 12.5px; line-height: 1.5;
          padding: 12px 14px; border-radius: 10px; margin-top: 14px; text-align: left;
        }
        .warn { color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.06); }
        .err { color: #fca5a5; border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.07); }

        .examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 22px; }
        .chip {
          background: transparent; color: var(--dim); border: 1px solid var(--line);
          border-radius: 999px; padding: 8px 14px; font: inherit; font-size: 12px; cursor: pointer;
          transition: all 0.15s ease;
        }
        .chip:hover { color: var(--fg); border-color: rgba(167, 139, 250, 0.5); background: rgba(167, 139, 250, 0.06); }

        .result { margin-top: 44px; }

        .review { margin-top: 56px; }
        .review h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--dim); margin-bottom: 8px; }
        .rsub { font-size: 12.5px; color: var(--dimmer); margin-bottom: 14px; max-width: 640px; line-height: 1.5; }
        .rchips { display: flex; flex-wrap: wrap; gap: 8px; }
        .rchip {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 12px; border-radius: 999px; cursor: pointer;
          border: 1px solid var(--line-strong); background: rgba(255,255,255,0.02);
          color: var(--fg); font: inherit; font-size: 12.5px;
          transition: border-color 0.12s ease, background 0.12s ease;
        }
        .rchip:hover { border-color: var(--accent); background: rgba(167,139,250,0.08); }
        .rdot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .rchip em { font-style: normal; color: var(--dimmer); font-variant-numeric: tabular-nums; }

        .shelf { margin-top: 64px; }
        .shelf h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--dim); margin-bottom: 14px; }
        .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .card {
          position: relative; border: 1px solid var(--line); border-radius: 14px;
          background: var(--panel); transition: border-color 0.15s ease, transform 0.15s ease;
        }
        .card:hover { border-color: rgba(167, 139, 250, 0.45); transform: translateY(-2px); }
        .card :global(.cardlink) { display: flex; flex-direction: column; gap: 8px; padding: 18px; text-decoration: none; color: inherit; }
        .cardtitle { font-weight: 700; font-size: 14.5px; padding-right: 26px; }
        .carddesc { font-size: 12px; color: var(--dim); line-height: 1.55; min-height: 34px; }
        .bar { height: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; margin-top: 4px; }
        .barfill { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
        .cardmeta { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--dimmer); margin-top: 2px; }
        .del {
          position: absolute; top: 12px; right: 12px;
          display: grid; place-items: center; width: 28px; height: 28px;
          border: none; border-radius: 8px; background: transparent; color: var(--dimmer); cursor: pointer;
        }
        .del:hover { color: #fca5a5; background: rgba(248, 113, 113, 0.08); }

        .foot { margin-top: 72px; text-align: center; font-size: 11.5px; color: var(--dimmer); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

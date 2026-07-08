import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Loader2, AlertTriangle, ArrowRight, GraduationCap } from 'lucide-react';
import { Player } from '@/components/Player';
import { CourseSidebar } from '@/components/CourseSidebar';
import { flattenLessons } from '@/lib/course';
import { getCourse, saveLessonDSL, saveProgress, StoredCourse } from '@/lib/store';

export default function CoursePage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  const [course, setCourse] = useState<StoredCourse | null>(null);
  const [missing, setMissing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [upNext, setUpNext] = useState<{ id: string; title: string; left: number } | null>(null);

  const refresh = useCallback(() => {
    if (!id) return;
    const c = getCourse(id);
    if (!c) { setMissing(true); return; }
    setCourse(c);
  }, [id]);

  // load once the route is ready; pick up where the learner left off
  useEffect(() => {
    if (!id) return;
    const c = getCourse(id);
    if (!c) { setMissing(true); return; }
    setCourse(c);
    const all = flattenLessons(c.outline);
    const next = all.find((e) => !c.progress[e.lesson.id]?.completed) || all[0];
    setCurrentId((cur) => cur || next?.lesson.id || null);
  }, [id]);

  const all = useMemo(() => (course ? flattenLessons(course.outline) : []), [course]);
  const current = all.find((e) => e.lesson.id === currentId) || null;
  const dsl = course && currentId ? course.lessons[currentId] : null;

  // generate the current lesson's timeline if it isn't cached yet
  useEffect(() => {
    if (!course || !currentId || course.lessons[currentId] || generatingId) return;
    let cancelled = false;
    setGeneratingId(currentId);
    setError('');
    (async () => {
      try {
        const res = await fetch('/api/generate-lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outline: course.outline, lessonId: currentId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lesson generation failed');
        if (cancelled) return;
        saveLessonDSL(course.outline.id, currentId, data.dsl);
        refresh();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setGeneratingId(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, currentId]);

  // up-next countdown
  useEffect(() => {
    if (!upNext) return;
    if (upNext.left <= 0) {
      setCurrentId(upNext.id);
      setUpNext(null);
      return;
    }
    const t = setTimeout(() => setUpNext((u) => (u ? { ...u, left: u.left - 1 } : null)), 1000);
    return () => clearTimeout(t);
  }, [upNext]);

  const selectLesson = useCallback((lessonId: string) => {
    setUpNext(null);
    setError('');
    setCurrentId(lessonId);
  }, []);

  const onEnded = useCallback(() => {
    if (!course || !currentId) return;
    saveProgress(course.outline.id, currentId, { watched: 1, completed: true });
    refresh();
    const at = all.findIndex((e) => e.lesson.id === currentId);
    const next = all[at + 1];
    if (next) setUpNext({ id: next.lesson.id, title: next.lesson.title, left: 5 });
  }, [course, currentId, all, refresh]);

  const onQuizResult = useCallback(
    (correct: boolean) => {
      if (!course || !currentId) return;
      const cur = getCourse(course.outline.id)?.progress[currentId];
      saveProgress(course.outline.id, currentId, {
        quizTotal: (cur?.quizTotal ?? 0) + 1,
        quizCorrect: (cur?.quizCorrect ?? 0) + (correct ? 1 : 0),
      });
      refresh();
    },
    [course, currentId, refresh],
  );

  const onProgress = useCallback(
    (f: number) => {
      if (!course || !currentId) return;
      saveProgress(course.outline.id, currentId, { watched: f });
    },
    [course, currentId],
  );

  const doneCount = course ? Object.values(course.progress).filter((p) => p.completed).length : 0;

  return (
    <>
      <Head>
        <title>{course ? `${course.outline.title} — newani` : 'course — newani'}</title>
      </Head>

      <div className="page">
        <header className="top">
          <Link href="/" className="back">
            <ArrowLeft size={15} /> studio
          </Link>
          <div className="crumb">
            <GraduationCap size={15} />
            <span className="ctitle">{course?.outline.title || '…'}</span>
          </div>
          {course && (
            <span className="done">
              {doneCount}/{all.length} lessons
            </span>
          )}
        </header>

        {missing ? (
          <div className="missing">
            <AlertTriangle size={18} />
            <p>This course isn&apos;t in your library on this device.</p>
            <Link href="/" className="mklink">make a new one →</Link>
          </div>
        ) : !course ? (
          <div className="missing"><Loader2 size={18} className="spin" /></div>
        ) : (
          <main className="grid">
            <aside className="rail">
              <p className="desc">{course.outline.description}</p>
              <CourseSidebar
                outline={course.outline}
                progress={course.progress}
                generated={new Set(Object.keys(course.lessons))}
                currentId={currentId}
                generatingId={generatingId}
                onSelect={selectLesson}
              />
            </aside>

            <section className="stagearea">
              {current && (
                <div className="lessonhead">
                  <h1>{current.lesson.title}</h1>
                  {current.lesson.objective && <p>{current.lesson.objective}</p>}
                </div>
              )}

              {error && (
                <div className="err">
                  <AlertTriangle size={14} />
                  <span>{error}</span>
                  <button onClick={() => { setError(''); setCurrentId(null); setTimeout(() => setCurrentId(currentId), 0); }}>retry</button>
                </div>
              )}

              <div className="playerwrap">
                {dsl ? (
                  <Player
                    key={currentId}
                    dsl={dsl}
                    autoPlay
                    onEnded={onEnded}
                    onQuizResult={onQuizResult}
                    onProgress={onProgress}
                  />
                ) : (
                  <div className="writing">
                    <Loader2 size={22} className="spin" />
                    <p className="wt">writing this lesson…</p>
                    <p className="ws">the model is scripting visuals, code and voiceover for “{current?.lesson.title}”</p>
                  </div>
                )}

                {upNext && (
                  <div className="upnext">
                    <span className="unlbl">up next in {upNext.left}s</span>
                    <span className="untitle">{upNext.title}</span>
                    <div className="unrow">
                      <button className="unbtn go" onClick={() => selectLesson(upNext.id)}>
                        play now <ArrowRight size={14} />
                      </button>
                      <button className="unbtn" onClick={() => setUpNext(null)}>cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>
        )}
      </div>

      <style jsx>{`
        .page { max-width: 1560px; margin: 0 auto; padding: 18px clamp(16px, 3vw, 40px) 60px; }
        .top {
          display: flex; align-items: center; gap: 18px;
          padding-bottom: 16px; margin-bottom: 22px;
          border-bottom: 1px solid var(--line);
        }
        .top :global(.back) {
          display: inline-flex; align-items: center; gap: 7px;
          color: var(--dim); text-decoration: none; font-size: 13px;
          padding: 7px 12px; border: 1px solid var(--line); border-radius: 9px;
        }
        .top :global(.back:hover) { color: var(--fg); border-color: var(--line-strong); }
        .crumb { display: flex; align-items: center; gap: 9px; color: var(--accent); min-width: 0; }
        .ctitle { color: var(--fg); font-weight: 700; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .done { margin-left: auto; font-size: 12px; color: var(--dim); border: 1px solid var(--line); padding: 6px 12px; border-radius: 999px; }

        .missing {
          min-height: 50vh; display: flex; flex-direction: column; gap: 12px;
          align-items: center; justify-content: center; color: var(--dim);
        }
        .missing :global(.mklink) { color: var(--accent); text-decoration: none; }

        .grid { display: grid; grid-template-columns: 300px 1fr; gap: 28px; align-items: start; }
        @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }

        .rail { position: sticky; top: 18px; display: flex; flex-direction: column; gap: 16px; }
        .desc { font-size: 12.5px; color: var(--dim); line-height: 1.6; padding: 0 10px; }

        .stagearea { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
        .lessonhead h1 { font-size: 19px; letter-spacing: -0.3px; }
        .lessonhead p { margin-top: 6px; font-size: 13px; color: var(--dim); }

        .err {
          display: flex; align-items: center; gap: 10px; font-size: 12.5px;
          padding: 12px 14px; border-radius: 10px; color: #fca5a5;
          border: 1px solid rgba(248, 113, 113, 0.3); background: rgba(248, 113, 113, 0.07);
        }
        .err button {
          margin-left: auto; background: transparent; border: 1px solid rgba(248,113,113,0.4);
          color: #fca5a5; border-radius: 7px; padding: 5px 12px; font: inherit; font-size: 12px; cursor: pointer;
        }

        .playerwrap { position: relative; }
        .writing {
          min-height: 480px; border: 1px dashed var(--line-strong); border-radius: 16px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
          background: radial-gradient(30rem 18rem at 50% 30%, rgba(139, 92, 246, 0.06), transparent 70%);
        }
        .writing .wt { font-size: 14.5px; color: var(--fg); }
        .writing .ws { font-size: 12.5px; color: var(--dim); max-width: 420px; text-align: center; line-height: 1.6; }

        .upnext {
          position: absolute; right: 18px; bottom: 84px;
          display: flex; flex-direction: column; gap: 8px;
          padding: 16px 18px; border-radius: 14px; max-width: 300px;
          background: rgba(13, 13, 20, 0.95); border: 1px solid var(--line-strong);
          box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.8);
          animation: pop 0.3s ease both;
        }
        .unlbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--accent); }
        .untitle { font-size: 14px; font-weight: 700; }
        .unrow { display: flex; gap: 8px; margin-top: 4px; }
        .unbtn {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid var(--line); background: transparent; color: var(--dim);
          border-radius: 8px; padding: 7px 12px; font: inherit; font-size: 12px; cursor: pointer;
        }
        .unbtn.go { background: var(--accent); border-color: transparent; color: #17103a; font-weight: 700; }
        .unbtn.go:hover { filter: brightness(1.08); }
        @keyframes pop { from { opacity: 0; transform: translateY(10px); } }
        :global(.spin) { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

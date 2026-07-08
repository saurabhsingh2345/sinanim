import React from 'react';
import { Check, Play, Loader2, Lock } from 'lucide-react';
import { CourseOutline } from '@/lib/course';
import { LessonProgress } from '@/lib/store';
import { cx } from '@/lib/utils';

interface CourseSidebarProps {
  outline: CourseOutline;
  progress: Record<string, LessonProgress>;
  /** Lesson ids that already have a generated timeline. */
  generated: Set<string>;
  currentId: string | null;
  generatingId: string | null;
  onSelect: (lessonId: string) => void;
}

export function CourseSidebar({ outline, progress, generated, currentId, generatingId, onSelect }: CourseSidebarProps) {
  let n = 0;
  return (
    <nav className="sidebar">
      {outline.modules.map((m, mi) => (
        <div className="module" key={mi}>
          <div className="mtitle">
            <span className="mnum">{String(mi + 1).padStart(2, '0')}</span>
            {m.title}
          </div>
          {m.lessons.map((l) => {
            n++;
            const p = progress[l.id];
            const isCurrent = l.id === currentId;
            const isGenerating = l.id === generatingId;
            const done = !!p?.completed;
            return (
              <button
                key={l.id}
                className={cx('lesson', isCurrent && 'current', done && 'done')}
                onClick={() => onSelect(l.id)}
              >
                <span className="state">
                  {isGenerating ? (
                    <Loader2 size={13} className="spin" />
                  ) : done ? (
                    <Check size={13} />
                  ) : isCurrent ? (
                    <Play size={11} fill="currentColor" />
                  ) : generated.has(l.id) ? (
                    <Play size={11} />
                  ) : (
                    <Lock size={11} />
                  )}
                </span>
                <span className="body">
                  <span className="ltitle">{n}. {l.title}</span>
                  {p && p.quizTotal > 0 && (
                    <span className="quiz">quiz {p.quizCorrect}/{p.quizTotal}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      <style jsx>{`
        .sidebar { display: flex; flex-direction: column; gap: 20px; }
        .module { display: flex; flex-direction: column; gap: 4px; }
        .mtitle {
          display: flex; align-items: baseline; gap: 10px;
          font-size: 12px; font-weight: 700; letter-spacing: 0.6px;
          text-transform: uppercase; color: var(--dim);
          padding: 0 10px 8px;
        }
        .mnum { color: var(--accent); font-size: 11px; }
        .lesson {
          display: flex; align-items: flex-start; gap: 11px;
          text-align: left; padding: 10px 12px;
          border: 1px solid transparent; border-radius: 11px;
          background: transparent; cursor: pointer; font: inherit;
          color: var(--dim);
          transition: background 0.12s ease, border-color 0.12s ease;
        }
        .lesson:hover { background: rgba(255, 255, 255, 0.035); color: var(--fg); }
        .lesson.current {
          background: rgba(167, 139, 250, 0.08);
          border-color: rgba(167, 139, 250, 0.28);
          color: var(--fg);
        }
        .lesson.done .state { color: var(--green); border-color: rgba(52, 211, 153, 0.4); }
        .state {
          flex: none; width: 22px; height: 22px; border-radius: 50%;
          display: grid; place-items: center;
          border: 1px solid var(--line); color: var(--dimmer);
          margin-top: 1px;
        }
        .lesson.current .state { color: var(--accent); border-color: rgba(167, 139, 250, 0.5); }
        .body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .ltitle { font-size: 12.5px; line-height: 1.45; }
        .quiz { font-size: 10.5px; color: var(--green); }
        :global(.spin) { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </nav>
  );
}

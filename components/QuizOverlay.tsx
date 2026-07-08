import React from 'react';
import { ArrowRight } from 'lucide-react';
import { QuizScene } from '@/lib/types';
import { quizLayout } from '@/lib/renderer';
import { cx } from '@/lib/utils';

interface QuizOverlayProps {
  scene: QuizScene;
  /** Frame size the layout was computed for (canvas coordinates). */
  frameW: number;
  frameH: number;
  selected: number | null;
  correct: boolean | null;
  onAnswer: (index: number) => void;
  onContinue: () => void;
}

/**
 * Invisible click targets laid exactly over the quiz options the canvas draws.
 * Rects come from the same quizLayout() the renderer uses, expressed in
 * percentages so no pixel measuring is needed at any display size.
 */
export function QuizOverlay({ scene, frameW, frameH, selected, correct, onAnswer, onContinue }: QuizOverlayProps) {
  const lay = quizLayout(scene, frameW, frameH);
  const pct = (r: { x: number; y: number; w: number; h: number }) => ({
    left: `${(r.x / frameW) * 100}%`,
    top: `${(r.y / frameH) * 100}%`,
    width: `${(r.w / frameW) * 100}%`,
    height: `${(r.h / frameH) * 100}%`,
  });
  const answered = selected != null;

  return (
    <div className="quiz-overlay">
      {!answered &&
        lay.options.map((r, i) => (
          <button
            key={i}
            className="opt"
            style={pct(r)}
            onClick={() => onAnswer(i)}
            aria-label={`Answer ${String.fromCharCode(65 + i)}: ${scene.options[i]}`}
          />
        ))}

      {answered && (
        <button className={cx('continue', correct ? 'good' : 'bad')} onClick={onContinue}>
          {correct ? 'Nice — keep going' : 'Got it — continue'}
          <ArrowRight size={15} />
        </button>
      )}

      <style jsx>{`
        .quiz-overlay { position: absolute; inset: 0; }
        .opt {
          position: absolute;
          background: transparent;
          border: 2px solid transparent;
          border-radius: 3.5%/8%;
          cursor: pointer;
          transition: border-color 0.12s ease, background 0.12s ease;
        }
        .opt:hover {
          border-color: rgba(167, 139, 250, 0.75);
          background: rgba(167, 139, 250, 0.07);
        }
        .continue {
          position: absolute;
          left: 50%;
          bottom: 5%;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 12px 22px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          font: inherit;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          color: #0d0d12;
          animation: rise 0.35s ease both;
        }
        .continue.good { background: linear-gradient(180deg, #4ade80, #22c55e); }
        .continue.bad { background: linear-gradient(180deg, #c4b5fd, #a78bfa); }
        .continue:hover { filter: brightness(1.07); }
        @keyframes rise {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}

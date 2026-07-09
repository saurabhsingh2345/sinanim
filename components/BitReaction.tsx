import React, { useEffect, useRef } from 'react';
import { drawMascot, MascotAction } from '@/lib/mascot';

// Bit, alive in the DOM: the same canvas-drawn mascot the lessons use, rendered
// in a small standalone canvas beside a speech bubble. Used by the playground so
// the character that taught you also reacts to your own code.

interface BitReactionProps {
  action: MascotAction;
  message: string;
  tone: 'praise' | 'nudge' | 'fix';
  loading?: boolean;
  onDismiss?: () => void;
}

export function BitReaction({ action, message, tone, loading, onDismiss }: BitReactionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef(performance.now());

  // restart the action clock whenever the action changes (re-triggers celebrate etc.)
  useEffect(() => { startRef.current = performance.now(); }, [action]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const local = (performance.now() - startRef.current) / 1000;
        drawMascot(ctx, {
          x: w / 2, y: h - 8, scale: (h / 180) * 0.78,
          action: loading ? 'think' : action,
          local, enterLocal: local, life: Infinity,
          aimX: w / 2 + 60, aimY: h * 0.4,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [action, loading]);

  return (
    <div className={`bit ${tone}`}>
      <canvas ref={canvasRef} className="bitcanvas" />
      <div className="bubble">
        {loading ? (
          <span className="dots"><i /><i /><i /></span>
        ) : (
          <p>{message}</p>
        )}
        {!loading && onDismiss && (
          <button className="x" onClick={onDismiss} aria-label="Dismiss">×</button>
        )}
      </div>

      <style jsx>{`
        .bit {
          display: flex; align-items: flex-end; gap: 6px;
          animation: bitin 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
          pointer-events: auto;
        }
        @keyframes bitin { from { opacity: 0; transform: translateY(12px) scale(0.96); } }
        .bitcanvas { width: 104px; height: 120px; flex: none; }
        .bubble {
          position: relative;
          max-width: 340px; margin-bottom: 22px;
          padding: 12px 30px 12px 15px;
          border-radius: 14px; border-bottom-left-radius: 4px;
          font-size: 13px; line-height: 1.5; color: var(--fg);
          background: rgba(22, 22, 30, 0.96);
          border: 1px solid var(--line-strong);
          box-shadow: 0 18px 40px -20px rgba(0, 0, 0, 0.8);
        }
        .bubble::before {
          content: ''; position: absolute; left: -7px; bottom: 14px;
          width: 12px; height: 12px; transform: rotate(45deg);
          background: rgba(22, 22, 30, 0.96);
          border-left: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong);
        }
        .bit.praise .bubble { border-color: rgba(52, 211, 153, 0.5); }
        .bit.praise .bubble::before { border-color: rgba(52, 211, 153, 0.5); }
        .bit.fix .bubble { border-color: rgba(251, 191, 36, 0.5); }
        .bit.fix .bubble::before { border-color: rgba(251, 191, 36, 0.5); }
        .bubble p { margin: 0; }
        .x {
          position: absolute; top: 6px; right: 8px;
          background: none; border: none; color: var(--dimmer);
          font-size: 16px; line-height: 1; cursor: pointer;
        }
        .x:hover { color: var(--fg); }
        .dots { display: inline-flex; gap: 4px; padding: 2px 0; }
        .dots i {
          width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
          animation: blink 1s infinite both;
        }
        .dots i:nth-child(2) { animation-delay: 0.15s; }
        .dots i:nth-child(3) { animation-delay: 0.3s; }
        @keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
      `}</style>
    </div>
  );
}

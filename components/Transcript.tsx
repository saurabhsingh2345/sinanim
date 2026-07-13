import React, { useEffect, useMemo, useRef } from 'react';
import { AnimationDSL } from '@/lib/types';
import { formatTime, cx } from '@/lib/utils';
import { stripSpeakers } from '@/lib/narration';

interface TranscriptProps {
  dsl: AnimationDSL;
  time: number;
  onSeek: (t: number) => void;
}

/** The narration script as a clickable, follow-along transcript. */
export function Transcript({ dsl, time, onSeek }: TranscriptProps) {
  const lines = useMemo(
    () =>
      dsl.scenes
        .map((s, i) => ({ i, at: s.startTime, text: stripSpeakers(s.narration || '') }))
        .filter((l) => l.text),
    [dsl],
  );

  const activeIdx = useMemo(() => {
    let best = -1;
    lines.forEach((l, k) => {
      if (time >= l.at - 1e-6) best = k;
    });
    return best;
  }, [lines, time]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  if (!lines.length) return null;

  return (
    <div className="transcript" ref={listRef}>
      {lines.map((l, k) => (
        <button
          key={l.i}
          className={cx('line', k === activeIdx && 'active')}
          data-active={k === activeIdx}
          onClick={() => onSeek(l.at)}
        >
          <span className="at">{formatTime(l.at)}</span>
          <span className="txt">{l.text}</span>
        </button>
      ))}

      <style jsx>{`
        .transcript {
          max-height: 240px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--panel);
        }
        .line {
          display: flex;
          gap: 14px;
          align-items: baseline;
          text-align: left;
          padding: 9px 12px;
          border: none;
          border-radius: 9px;
          background: transparent;
          cursor: pointer;
          font: inherit;
          transition: background 0.12s ease;
        }
        .line:hover { background: rgba(255, 255, 255, 0.035); }
        .line.active { background: rgba(167, 139, 250, 0.09); }
        .at {
          flex: none;
          font-size: 11px;
          color: var(--dimmer);
          font-variant-numeric: tabular-nums;
          min-width: 38px;
        }
        .line.active .at { color: var(--accent); }
        .txt { font-size: 12.5px; line-height: 1.55; color: var(--dim); }
        .line.active .txt { color: var(--fg); }
      `}</style>
    </div>
  );
}

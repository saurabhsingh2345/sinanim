import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Loader2,
} from 'lucide-react';
import { AnimationDSL } from '@/lib/types';
import { Prepared, prepare, renderFrame } from '@/lib/renderer';
import { SoundEngine } from '@/lib/sounds';
import { Conductor } from '@/lib/conductor';
import { recordVideo, downloadBlob } from '@/lib/export';
import { formatTime, clamp, cx } from '@/lib/utils';

interface StageProps {
  dsl: AnimationDSL;
}

export function Stage({ dsl }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SoundEngine | null>(null);
  const conductorRef = useRef<Conductor | null>(null);
  const prepRef = useRef<Prepared | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!engineRef.current && typeof window !== 'undefined') {
    engineRef.current = new SoundEngine();
    conductorRef.current = new Conductor(engineRef.current);
  }

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const prep = prepRef.current;
    if (!canvas || !prep) return;
    const ctx = canvas.getContext('2d');
    if (ctx) renderFrame(ctx, prep, t);
  }, []);

  // Prepare (tokenize) whenever the DSL changes.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    playingRef.current = false;
    setPlaying(false);
    (async () => {
      // ensure the mono font is available before measuring/drawing
      try {
        await (document as any).fonts?.load?.('30px "JetBrains Mono"');
        await (document as any).fonts?.ready;
      } catch {}
      const prep = await prepare(dsl);
      if (cancelled) return;
      prepRef.current = prep;
      timeRef.current = 0;
      setTime(0);
      conductorRef.current?.reset(0);
      setReady(true);
      draw(0);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [dsl, draw]);

  const tickLoop = useCallback(
    (ts: number) => {
      if (!playingRef.current) return;
      const prep = prepRef.current;
      if (!prep) return;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      let t = timeRef.current + dt;

      if (t >= dsl.duration) {
        t = dsl.duration;
        timeRef.current = t;
        draw(t);
        conductorRef.current?.tick(prep, t);
        setTime(t);
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      timeRef.current = t;
      draw(t);
      conductorRef.current?.tick(prep, t);
      setTime(t);
      rafRef.current = requestAnimationFrame(tickLoop);
    },
    [dsl, draw],
  );

  const play = useCallback(async () => {
    if (!ready || exporting) return;
    await engineRef.current?.resume();
    if (timeRef.current >= dsl.duration) {
      timeRef.current = 0;
      setTime(0);
    }
    conductorRef.current?.reset(timeRef.current);
    playingRef.current = true;
    setPlaying(true);
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tickLoop);
  }, [ready, exporting, dsl.duration, tickLoop]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const seek = useCallback(
    (t: number) => {
      const clamped = clamp(t, 0, dsl.duration);
      timeRef.current = clamped;
      setTime(clamped);
      conductorRef.current?.reset(clamped);
      draw(clamped);
    },
    [dsl.duration, draw],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (engineRef.current) engineRef.current.muted = next;
      return next;
    });
  }, []);

  const doExport = useCallback(async () => {
    const canvas = canvasRef.current;
    const prep = prepRef.current;
    const engine = engineRef.current;
    if (!canvas || !prep || !engine || exporting) return;
    pause();
    setExporting(true);
    setProgress(0);
    try {
      const wasMuted = engine.muted;
      engine.muted = false; // always bake audio into the export
      const { blob, ext } = await recordVideo(canvas, prep, engine, setProgress);
      engine.muted = wasMuted;
      const safe = dsl.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      downloadBlob(blob, `${safe || 'animation'}.${ext}`);
      seek(0);
    } catch (e) {
      console.error(e);
      alert('Export failed: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [dsl.title, exporting, pause, seek]);

  const atEnd = time >= dsl.duration - 1e-3;

  return (
    <div className="stage">
      <div className="screen">
        <canvas
          ref={canvasRef}
          width={dsl.width}
          height={dsl.height}
          className="canvas"
        />
        {!ready && (
          <div className="loading">
            <Loader2 className="spin" size={22} />
            <span>compiling frames…</span>
          </div>
        )}
        {exporting && (
          <div className="exporting">
            <div className="rec-dot" />
            <span>recording {Math.round(progress * 100)}%</span>
          </div>
        )}
      </div>

      <div className="controls">
        <button
          className="ctl primary"
          onClick={atEnd ? () => { seek(0); play(); } : playing ? pause : play}
          disabled={!ready || exporting}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {atEnd ? <RotateCcw size={18} /> : playing ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <button className="ctl" onClick={() => seek(0)} disabled={exporting} aria-label="Restart">
          <RotateCcw size={16} />
        </button>

        <input
          type="range"
          className="scrub"
          min={0}
          max={dsl.duration}
          step={0.01}
          value={time}
          onChange={(e) => { pause(); seek(parseFloat(e.target.value)); }}
          disabled={exporting}
          style={{ ['--pct' as any]: `${(time / dsl.duration) * 100}%` }}
        />

        <span className="time">{formatTime(time)} / {formatTime(dsl.duration)}</span>

        <button className="ctl" onClick={toggleMute} aria-label="Mute">
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        <button
          className={cx('ctl', 'export', exporting && 'busy')}
          onClick={doExport}
          disabled={!ready || exporting}
        >
          {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
          <span>{exporting ? `${Math.round(progress * 100)}%` : 'Export'}</span>
        </button>
      </div>

      <style jsx>{`
        .stage { display: flex; flex-direction: column; gap: 14px; }
        .screen {
          position: relative;
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
          background: #000;
          box-shadow: 0 30px 80px -30px rgba(0,0,0,0.9);
        }
        .canvas { display: block; width: 100%; height: auto; }
        .loading, .exporting {
          position: absolute; inset: auto 0 0 auto;
          display: flex; align-items: center; gap: 10px;
          padding: 10px 16px; font-size: 13px; color: var(--dim);
          background: rgba(13,13,15,0.8); backdrop-filter: blur(8px);
        }
        .loading { inset: 0; justify-content: center; }
        .exporting { top: 14px; right: 14px; bottom: auto; border-radius: 999px; border: 1px solid var(--line); color: var(--fg); }
        .rec-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--pink); animation: pulse 1s infinite; }
        .controls {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px; border: 1px solid var(--line);
          border-radius: 12px; background: var(--panel);
        }
        .ctl {
          display: inline-flex; align-items: center; gap: 8px;
          height: 38px; padding: 0 12px; border-radius: 9px;
          border: 1px solid var(--line); background: transparent;
          color: var(--fg); cursor: pointer; font: inherit; font-size: 13px;
          transition: all .15s ease;
        }
        .ctl:hover:not(:disabled) { border-color: var(--line-strong); background: rgba(255,255,255,0.03); }
        .ctl:disabled { opacity: .4; cursor: not-allowed; }
        .ctl.primary {
          width: 46px; justify-content: center; padding: 0;
          background: linear-gradient(180deg, var(--pink), #e5527a);
          color: #14040a; border: none;
        }
        .ctl.primary:hover:not(:disabled) { filter: brightness(1.08); }
        .ctl.export { margin-left: auto; color: var(--green); border-color: rgba(52,211,153,0.4); }
        .ctl.export:hover:not(:disabled) { background: rgba(52,211,153,0.08); }
        .time { font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; min-width: 90px; }
        .scrub {
          flex: 1; -webkit-appearance: none; appearance: none; height: 5px;
          border-radius: 999px; cursor: pointer;
          background: linear-gradient(90deg, var(--cyan) var(--pct), rgba(255,255,255,0.12) var(--pct));
        }
        .scrub::-webkit-slider-thumb {
          -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%;
          background: var(--cyan); border: 2px solid #0d0d0f; cursor: pointer;
        }
        .scrub::-moz-range-thumb { width: 13px; height: 13px; border-radius: 50%; background: var(--cyan); border: 2px solid #0d0d0f; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 50% { opacity: .3; } }
      `}</style>
    </div>
  );
}

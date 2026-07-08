import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Loader2,
  Settings2,
  Maximize,
  Minimize,
  Captions,
  Mic,
  MicOff,
} from 'lucide-react';
import { AnimationDSL, QuizScene } from '@/lib/types';
import { Prepared, prepare, renderFrame, RenderUI } from '@/lib/renderer';
import { SoundEngine } from '@/lib/sounds';
import { Conductor } from '@/lib/conductor';
import { recordVideo, downloadBlob } from '@/lib/export';
import { buildNarration } from '@/lib/narration';
import { DEFAULT_VOICE, NarrationEngine, TTSPhase, VOICES } from '@/lib/tts';
import { formatTime, clamp, cx } from '@/lib/utils';
import { QuizOverlay } from './QuizOverlay';
import { Transcript } from './Transcript';

// ── Chapters (seekbar segments) ────────────────────────────────────────────────
const SECTION_TYPES = new Set([
  'title', 'chapter', 'code', 'diff', 'terminal', 'bullets', 'diagram', 'quote', 'bigstat', 'quiz',
]);

interface Chapter { start: number; end: number; label: string; kind: string; }

function chapterLabel(s: AnimationDSL['scenes'][number]): string {
  switch (s.type) {
    case 'title': return s.text;
    case 'chapter': return s.text;
    case 'code': return s.title || `${s.language} code`;
    case 'diff': return s.title || 'evolving the code';
    case 'terminal': return 'running it';
    case 'bullets': return s.title || 'key points';
    case 'diagram': return s.title || 'how it fits together';
    case 'quote': return 'worth remembering';
    case 'bigstat': return s.label || 'the numbers';
    case 'quiz': return 'checkpoint';
    default: return s.type;
  }
}

function buildChapters(dsl: AnimationDSL): Chapter[] {
  const sections = dsl.scenes
    .filter((s) => SECTION_TYPES.has(s.type))
    .sort((a, b) => a.startTime - b.startTime);
  if (!sections.length) return [{ start: 0, end: dsl.duration, label: dsl.title, kind: 'title' }];
  return sections.map((s, i) => ({
    start: i === 0 ? 0 : s.startTime,
    end: i + 1 < sections.length ? sections[i + 1].startTime : dsl.duration,
    label: chapterLabel(s),
    kind: s.type,
  })).filter((c) => c.end - c.start > 0.05);
}

/** Scene-relative moment a quiz's options are all on screen (safe to pause). */
function quizOptionsIn(scene: QuizScene): number {
  return 0.55 + 0.35 + (scene.options.length - 1) * 0.14 + 0.35;
}
function quizPauseAt(scene: QuizScene): number {
  const voice = Math.min(scene.narrationDuration ?? 0, scene.duration - 0.6);
  return scene.startTime + Math.max(quizOptionsIn(scene), voice);
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

// ── Player ─────────────────────────────────────────────────────────────────────
export interface PlayerProps {
  dsl: AnimationDSL;
  /** Start playing as soon as the pipeline is ready (needs a prior user gesture). */
  autoPlay?: boolean;
  showTranscript?: boolean;
  onEnded?: () => void;
  onQuizResult?: (correct: boolean) => void;
  /** Furthest point reached, 0..1 — fired on pause/end. */
  onProgress?: (fraction: number) => void;
}

export function Player({ dsl, autoPlay, showTranscript = true, onEnded, onQuizResult, onProgress }: PlayerProps) {
  const screenRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SoundEngine | null>(null);
  const conductorRef = useRef<Conductor | null>(null);
  const narrEngineRef = useRef<NarrationEngine | null>(null);
  const narrBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const prepRef = useRef<Prepared | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);
  const speedRef = useRef(1);
  const answeredRef = useRef<Set<number>>(new Set());
  const quizUiRef = useRef<RenderUI | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(dsl.captions !== false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showCtl, setShowCtl] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [quiz, setQuiz] = useState<{ idx: number; selected: number | null; correct: boolean | null } | null>(null);

  const hasNarration = dsl.scenes.some((s) => s.narration);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voice, setVoice] = useState(dsl.voice || DEFAULT_VOICE);
  const [tts, setTts] = useState<TTSPhase>({ phase: 'idle' });
  const [adsl, setAdsl] = useState<AnimationDSL>(dsl);

  if (!engineRef.current && typeof window !== 'undefined') {
    engineRef.current = new SoundEngine();
    conductorRef.current = new Conductor(engineRef.current);
    conductorRef.current.interactive = true; // quizzes are answered, not auto-revealed
    narrEngineRef.current = new NarrationEngine();
  }

  const chapters = useMemo(() => buildChapters(adsl), [adsl]);

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const prep = prepRef.current;
    if (!canvas || !prep) return;
    const ctx = canvas.getContext('2d');
    if (ctx) renderFrame(ctx, prep, t, quizUiRef.current);
  }, []);

  // ── Pipeline: synthesize narration, pace, tokenize ──
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    playingRef.current = false;
    setPlaying(false);
    setQuiz(null);
    quizUiRef.current = undefined;
    answeredRef.current.clear();
    engineRef.current?.stopNarration();
    (async () => {
      try {
        await (document as any).fonts?.load?.('30px "JetBrains Mono"');
        await (document as any).fonts?.ready;
      } catch {}

      let effective = dsl;
      let buffers = new Map<number, AudioBuffer>();
      if (voiceOn && hasNarration && engineRef.current && narrEngineRef.current) {
        try {
          const res = await buildNarration(
            { ...dsl, voice },
            narrEngineRef.current,
            engineRef.current.context,
            (p) => { if (!cancelled) setTts(p); },
          );
          effective = res.dsl;
          buffers = res.buffers;
        } catch (e) {
          if (!cancelled) {
            setTts({ phase: 'error', message: e instanceof Error ? e.message : 'voice synthesis failed' });
          }
        }
      } else {
        setTts({ phase: 'idle' });
      }
      if (cancelled) return;

      narrBuffersRef.current = buffers;
      conductorRef.current?.setNarration(buffers);

      const prep = await prepare(effective);
      if (cancelled) return;
      prepRef.current = prep;
      timeRef.current = 0;
      setTime(0);
      conductorRef.current?.reset(0);
      setAdsl(effective);
      setReady(true);
      draw(0);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsl, voice, voiceOn, hasNarration, draw]);

  // ── Playback loop ──
  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.stopNarration();
    const total = prepRef.current?.dsl.duration || 1;
    onProgress?.(clamp(timeRef.current / total, 0, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onProgress]);

  const tickLoop = useCallback(
    (ts: number) => {
      if (!playingRef.current) return;
      const prep = prepRef.current;
      if (!prep) return;
      const total = prep.dsl.duration;
      const dt = ((ts - lastTsRef.current) / 1000) * speedRef.current;
      lastTsRef.current = ts;
      const prevT = timeRef.current;
      let t = prevT + dt;

      // interactive checkpoint: stop the clock once the options are on screen
      let pausedForQuiz = -1;
      prep.dsl.scenes.forEach((s, i) => {
        if (s.type !== 'quiz' || answeredRef.current.has(i)) return;
        const at = quizPauseAt(s as QuizScene);
        if (prevT < at && t >= at) {
          t = Math.min(t, at);
          pausedForQuiz = i;
        }
      });

      const ended = t >= total && pausedForQuiz < 0;
      if (ended) t = total;

      timeRef.current = t;
      draw(t);
      conductorRef.current?.tick(prep, t);
      setTime(t);

      if (pausedForQuiz >= 0) {
        quizUiRef.current = { quiz: { selected: null, correct: null } };
        setQuiz({ idx: pausedForQuiz, selected: null, correct: null });
        playingRef.current = false;
        setPlaying(false);
        engineRef.current?.stopNarration();
        draw(t);
        return;
      }
      if (ended) {
        playingRef.current = false;
        setPlaying(false);
        engineRef.current?.stopNarration();
        onProgress?.(1);
        onEnded?.();
        return;
      }
      rafRef.current = requestAnimationFrame(tickLoop);
    },
    [draw, onEnded, onProgress],
  );

  const play = useCallback(async () => {
    if (!ready || exporting || playingRef.current) return;
    await engineRef.current?.resume();
    const total = prepRef.current?.dsl.duration || 0;
    if (timeRef.current >= total) {
      timeRef.current = 0;
      setTime(0);
      answeredRef.current.clear();
    }
    conductorRef.current!.rate = speedRef.current;
    conductorRef.current?.reset(timeRef.current);
    playingRef.current = true;
    setPlaying(true);
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tickLoop);
  }, [ready, exporting, tickLoop]);

  const seek = useCallback(
    (t: number) => {
      const total = prepRef.current?.dsl.duration || 0;
      const clamped = clamp(t, 0, total);
      // seeking back before a checkpoint re-arms it
      prepRef.current?.dsl.scenes.forEach((s, i) => {
        if (s.type === 'quiz' && clamped < quizPauseAt(s as QuizScene)) answeredRef.current.delete(i);
      });
      setQuiz(null);
      quizUiRef.current = undefined;
      timeRef.current = clamped;
      setTime(clamped);
      conductorRef.current?.reset(clamped);
      draw(clamped);
    },
    [draw],
  );

  // autoplay only when the audio context is already unlocked by a user gesture
  useEffect(() => {
    if (ready && autoPlay && engineRef.current?.context.state === 'running') {
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ── Quiz answering ──
  const answerQuiz = useCallback(
    (choice: number) => {
      if (!quiz || quiz.selected != null) return;
      const scene = prepRef.current?.dsl.scenes[quiz.idx] as QuizScene | undefined;
      if (!scene) return;
      const correct = choice === scene.answerIndex;
      answeredRef.current.add(quiz.idx);
      quizUiRef.current = { quiz: { selected: choice, correct } };
      setQuiz({ ...quiz, selected: choice, correct });
      if (correct) engineRef.current?.chime();
      else engineRef.current?.buzz();
      onQuizResult?.(correct);
      draw(timeRef.current);
    },
    [quiz, draw, onQuizResult],
  );

  const continueAfterQuiz = useCallback(() => {
    if (!quiz) return;
    const scene = prepRef.current?.dsl.scenes[quiz.idx];
    setQuiz(null);
    quizUiRef.current = undefined;
    // skip the rest of the checkpoint hold — the learner already answered
    if (scene) timeRef.current = Math.max(timeRef.current, scene.startTime + scene.duration - 0.35);
    play();
  }, [quiz, play]);

  // ── Controls visibility ──
  const poke = useCallback(() => {
    setShowCtl(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playingRef.current) setShowCtl(false);
    }, 2600);
  }, []);
  useEffect(() => {
    if (!playing) setShowCtl(true);
    else poke();
  }, [playing, poke]);

  // ── Misc controls ──
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (engineRef.current) {
        engineRef.current.muted = next;
        if (next) engineRef.current.stopNarration();
        else if (playingRef.current) conductorRef.current?.reset(timeRef.current);
      }
      return next;
    });
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed((s) => {
      const next = SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length];
      speedRef.current = next;
      if (conductorRef.current) {
        conductorRef.current.rate = next;
        if (playingRef.current) conductorRef.current.reset(timeRef.current);
      }
      return next;
    });
  }, []);

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((c) => {
      const next = !c;
      if (prepRef.current) prepRef.current.dsl.captions = next;
      draw(timeRef.current);
      return next;
    });
  }, [draw]);

  const toggleFullscreen = useCallback(() => {
    const el = screenRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (playingRef.current) pause();
          else play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          pause();
          seek(timeRef.current - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          pause();
          seek(timeRef.current + 5);
          break;
        case 'm': toggleMute(); break;
        case 'c': toggleCaptions(); break;
        case 'f': toggleFullscreen(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [play, pause, seek, toggleMute, toggleCaptions, toggleFullscreen]);

  // ── Seekbar interaction ──
  const barRef = useRef<HTMLDivElement>(null);
  const scrub = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      const total = prepRef.current?.dsl.duration || 0;
      if (!bar || !total) return;
      const r = bar.getBoundingClientRect();
      seek(((clientX - r.left) / r.width) * total);
    },
    [seek],
  );
  const onBarPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pause();
      scrub(e.clientX);
      const move = (ev: PointerEvent) => scrub(ev.clientX);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [pause, scrub],
  );

  // ── Export ──
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
      const { blob, ext } = await recordVideo(canvas, prep, engine, setProgress, narrBuffersRef.current);
      engine.muted = wasMuted;
      const safe = adsl.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      downloadBlob(blob, `${safe || 'lesson'}.${ext}`);
      seek(0);
    } catch (e) {
      console.error(e);
      alert('Export failed: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setExporting(false);
      setProgress(0);
    }
  }, [adsl.title, exporting, pause, seek]);

  const atEnd = time >= adsl.duration - 1e-3;
  const quizScene = quiz ? (adsl.scenes[quiz.idx] as QuizScene) : null;

  const ttsLabel =
    tts.phase === 'download'
      ? `downloading voice model ${tts.pct}%`
      : tts.phase === 'synthesize'
        ? `synthesizing narration ${tts.done}/${tts.total}`
        : tts.phase === 'error'
          ? `voice failed — playing silent`
          : null;

  return (
    <div className="player">
      <div
        className={cx('screen', playing && !showCtl && 'hidecursor')}
        ref={screenRef}
        onMouseMove={poke}
        onMouseLeave={() => { if (playingRef.current) setShowCtl(false); }}
      >
        <canvas
          ref={canvasRef}
          width={adsl.width}
          height={adsl.height}
          className="canvas"
          onClick={() => {
            if (!ready || quiz || exporting) return;
            if (playing) pause();
            else play();
          }}
        />

        {!ready && (
          <div className="loading">
            <Loader2 className="spin" size={22} />
            <span>{ttsLabel || 'compiling frames…'}</span>
          </div>
        )}

        {ready && !playing && !quiz && !exporting && !atEnd && (
          <button className="bigplay" onClick={play} aria-label="Play">
            <Play size={30} fill="currentColor" />
          </button>
        )}
        {ready && atEnd && !exporting && !quiz && (
          <button className="bigplay" onClick={() => { seek(0); play(); }} aria-label="Replay">
            <RotateCcw size={28} />
          </button>
        )}

        {quizScene && (
          <QuizOverlay
            scene={quizScene}
            frameW={adsl.width}
            frameH={adsl.height}
            selected={quiz!.selected}
            correct={quiz!.correct}
            onAnswer={answerQuiz}
            onContinue={continueAfterQuiz}
          />
        )}

        {exporting && (
          <div className="exporting">
            <div className="rec-dot" />
            <span>recording {Math.round(progress * 100)}%</span>
          </div>
        )}

        {/* ── control bar ── */}
        <div className={cx('ctlbar', (showCtl || !playing) && ready && !exporting && 'visible')}>
          <div className="seek" ref={barRef} onPointerDown={onBarPointerDown}>
            {chapters.map((c, i) => {
              const w = ((c.end - c.start) / adsl.duration) * 100;
              const fill = clamp((time - c.start) / (c.end - c.start), 0, 1) * 100;
              return (
                <div key={i} className={cx('seg', c.kind === 'quiz' && 'quizseg')} style={{ width: `${w}%` }}>
                  <div className="fill" style={{ width: `${fill}%` }} />
                  <div className="tip">{c.label}</div>
                </div>
              );
            })}
          </div>

          <div className="row">
            <button className="ib" onClick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
            <button className="ib" onClick={toggleMute} aria-label="Mute">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <span className="time">
              {formatTime(time)} <em>/</em> {formatTime(adsl.duration)}
            </span>

            <span className="grow" />

            <button className="ib txt" onClick={cycleSpeed} aria-label="Playback speed">
              {speed}×
            </button>
            <button className={cx('ib', captionsOn && 'on')} onClick={toggleCaptions} aria-label="Captions">
              <Captions size={17} />
            </button>
            {hasNarration && (
              <button className={cx('ib', showSettings && 'on')} onClick={() => setShowSettings((s) => !s)} aria-label="Voice settings">
                <Settings2 size={16} />
              </button>
            )}
            <button className="ib" onClick={doExport} aria-label="Export video">
              <Download size={16} />
            </button>
            <button className="ib" onClick={toggleFullscreen} aria-label="Fullscreen">
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>

          {showSettings && (
            <div className="settings">
              <button className={cx('vtoggle', voiceOn && 'on')} onClick={() => setVoiceOn((v) => !v)}>
                {voiceOn ? <Mic size={13} /> : <MicOff size={13} />}
                {voiceOn ? 'narration on' : 'narration off'}
              </button>
              <select className="vselect" value={voice} onChange={(e) => setVoice(e.target.value)} disabled={!voiceOn}>
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              {ttsLabel && <span className="vinfo">{ttsLabel}</span>}
            </div>
          )}
        </div>
      </div>

      {showTranscript && ready && <Transcript dsl={adsl} time={time} onSeek={(t) => { pause(); seek(t); }} />}

      <style jsx>{`
        .player { display: flex; flex-direction: column; gap: 14px; }
        .screen {
          position: relative;
          border: 1px solid var(--line);
          border-radius: 16px;
          overflow: hidden;
          background: #000;
          box-shadow: 0 40px 90px -35px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(167,139,250,0.06);
        }
        .screen.hidecursor { cursor: none; }
        .screen:fullscreen { border-radius: 0; border: none; display: grid; place-items: center; }
        .screen:fullscreen .canvas { max-height: 100vh; }
        .canvas { display: block; width: 100%; height: auto; cursor: pointer; }

        .loading {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          font-size: 13px; color: var(--dim);
          background: rgba(8, 8, 12, 0.82); backdrop-filter: blur(8px);
        }

        .bigplay {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          width: 76px; height: 76px; border-radius: 50%;
          display: grid; place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(19, 19, 28, 0.72);
          backdrop-filter: blur(10px);
          color: var(--fg); cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .bigplay:hover { transform: translate(-50%, -50%) scale(1.06); background: rgba(139, 92, 246, 0.35); }

        .exporting {
          position: absolute; top: 14px; right: 14px;
          display: flex; align-items: center; gap: 10px;
          padding: 9px 15px; font-size: 12.5px; color: var(--fg);
          background: rgba(10, 10, 16, 0.85); backdrop-filter: blur(8px);
          border: 1px solid var(--line); border-radius: 999px;
        }
        .rec-dot { width: 9px; height: 9px; border-radius: 50%; background: #f87171; animation: pulse 1s infinite; }

        .ctlbar {
          position: absolute; left: 0; right: 0; bottom: 0;
          padding: 26px 16px 12px;
          display: flex; flex-direction: column; gap: 10px;
          background: linear-gradient(transparent, rgba(5, 5, 9, 0.88));
          opacity: 0; transform: translateY(6px); pointer-events: none;
          transition: opacity 0.22s ease, transform 0.22s ease;
        }
        .ctlbar.visible { opacity: 1; transform: none; pointer-events: auto; }

        .seek { display: flex; gap: 3px; height: 14px; align-items: center; cursor: pointer; touch-action: none; }
        .seg {
          position: relative; height: 4px; border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
          transition: height 0.12s ease;
          min-width: 5px;
        }
        .seek:hover .seg { height: 6px; }
        .seg .fill { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--accent); }
        .seg.quizseg .fill { background: #34d399; }
        .seg .tip {
          position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
          padding: 5px 10px; border-radius: 7px; white-space: nowrap;
          font-size: 11px; color: var(--fg);
          background: rgba(12, 12, 18, 0.95); border: 1px solid var(--line);
          opacity: 0; pointer-events: none; transition: opacity 0.12s ease;
        }
        .seg:hover .tip { opacity: 1; }

        .row { display: flex; align-items: center; gap: 6px; }
        .grow { flex: 1; }
        .ib {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          width: 36px; height: 34px; border-radius: 9px;
          border: none; background: transparent; color: rgba(236, 235, 242, 0.85);
          cursor: pointer; font: inherit; font-size: 12px;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .ib:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
        .ib.on { color: var(--accent); }
        .ib.txt { width: auto; padding: 0 10px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .time { font-size: 12px; color: rgba(236, 235, 242, 0.75); font-variant-numeric: tabular-nums; margin-left: 6px; }
        .time em { font-style: normal; color: var(--dimmer); }

        .settings {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 11px;
          background: rgba(14, 14, 20, 0.92); border: 1px solid var(--line);
        }
        .vtoggle {
          display: inline-flex; align-items: center; gap: 7px;
          height: 30px; padding: 0 11px; border-radius: 8px;
          border: 1px solid var(--line); background: transparent;
          color: var(--dim); cursor: pointer; font: inherit; font-size: 12px;
        }
        .vtoggle.on { color: var(--accent); border-color: rgba(167, 139, 250, 0.45); }
        .vselect {
          appearance: none; background: transparent; color: var(--fg);
          border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px;
          font: inherit; font-size: 12px; cursor: pointer;
        }
        .vselect:disabled { opacity: 0.4; }
        .vinfo { font-size: 11px; color: var(--dimmer); margin-left: auto; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

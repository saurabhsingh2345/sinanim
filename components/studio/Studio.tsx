import React, { useMemo, useState } from 'react';
import {
  AnimationDSL,
  ApiScene,
  BigStatScene,
  BrowserScene,
  BulletsScene,
  ChallengeScene,
  ChapterScene,
  CliScene,
  CodeScene,
  DiagramScene,
  DiffScene,
  IdeScene,
  LayoutScene,
  MascotScene,
  PrScene,
  QuizScene,
  QuoteScene,
  Scene,
  SplitScene,
  TerminalScene,
  TitleScene,
  VizScene,
} from '@/lib/types';
import { normalizeDSL } from '@/lib/dsl';
import { sceneBeatTitle, sceneTypeLabel } from '@/lib/sceneMeta';
import { runVisualQA } from '@/lib/qa';
import { Player } from '@/components/Player';
import { SceneTimeline } from './SceneTimeline';
import { IdeEditor } from './IdeEditor';
import { BrowserEditor } from './BrowserEditor';
import { ApiEditor, CliEditor, LayoutEditor, PrEditor, SplitEditor } from './Inspectors';
import {
  BulletsEditor,
  ChallengeEditor,
  ChapterEditor,
  DiagramEditor,
  InspectorTabs,
  MascotEditor,
  QuizEditor,
  QuoteEditor,
  ThemeSwatches,
  TitleEditor,
  useInspectorTab,
} from './TeachingEditors';
import {
  BigStatEditor,
  CodeEditor,
  DiffEditor,
  TerminalEditor,
  VizEditor,
} from './SurfaceEditors';
import { Settings2, Sparkles, Wand2 } from 'lucide-react';
import { VOICES } from '@/lib/tts';

function SceneInspector({
  scene,
  tab,
  onChange,
}: {
  scene: Scene;
  tab: 'content' | 'voice' | 'look';
  onChange: (patch: Partial<Scene>) => void;
}) {
  switch (scene.type) {
    case 'title':
      return <TitleEditor scene={scene as TitleScene} tab={tab} onChange={onChange} />;
    case 'chapter':
      return <ChapterEditor scene={scene as ChapterScene} tab={tab} onChange={onChange} />;
    case 'bullets':
      return <BulletsEditor scene={scene as BulletsScene} tab={tab} onChange={onChange} />;
    case 'quiz':
      return <QuizEditor scene={scene as QuizScene} tab={tab} onChange={onChange} />;
    case 'mascot':
      return <MascotEditor scene={scene as MascotScene} tab={tab} onChange={onChange} />;
    case 'challenge':
      return <ChallengeEditor scene={scene as ChallengeScene} tab={tab} onChange={onChange} />;
    case 'quote':
      return <QuoteEditor scene={scene as QuoteScene} tab={tab} onChange={onChange} />;
    case 'diagram':
      return <DiagramEditor scene={scene as DiagramScene} tab={tab} onChange={onChange} />;
    case 'ide':
      return <IdeEditor scene={scene as IdeScene} tab={tab} onChange={onChange} />;
    case 'browser':
      return <BrowserEditor scene={scene as BrowserScene} tab={tab} onChange={onChange} />;
    case 'cli':
      return <CliEditor scene={scene as CliScene} tab={tab} onChange={onChange} />;
    case 'api':
      return <ApiEditor scene={scene as ApiScene} tab={tab} onChange={onChange} />;
    case 'pr':
      return <PrEditor scene={scene as PrScene} tab={tab} onChange={onChange} />;
    case 'split':
      return <SplitEditor scene={scene as SplitScene} tab={tab} onChange={onChange} />;
    case 'layout':
      return <LayoutEditor scene={scene as LayoutScene} tab={tab} onChange={onChange} />;
    case 'viz':
      return <VizEditor scene={scene as VizScene} tab={tab} onChange={onChange} />;
    case 'code':
      return <CodeEditor scene={scene as CodeScene} tab={tab} onChange={onChange} />;
    case 'diff':
      return <DiffEditor scene={scene as DiffScene} tab={tab} onChange={onChange} />;
    case 'terminal':
      return <TerminalEditor scene={scene as TerminalScene} tab={tab} onChange={onChange} />;
    case 'bigstat':
      return <BigStatEditor scene={scene as BigStatScene} tab={tab} onChange={onChange} />;
    default:
      return (
        <p className="studio-hint">
          This beat type ({scene.type}) plays in the preview. Change voiceover and timing in the other tabs, or replace it with Add scene.
        </p>
      );
  }
}

export function Studio({
  dsl,
  onChange,
  onClose,
}: {
  dsl: AnimationDSL;
  onChange: (dsl: AnimationDSL) => void;
  onClose?: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qaNotes, setQaNotes] = useState<string[]>([]);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteInstr, setRewriteInstr] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteErr, setRewriteErr] = useState('');
  const { tab, setTab } = useInspectorTab();
  const scene = dsl.scenes[Math.min(selected, dsl.scenes.length - 1)];

  const liveDsl = useMemo(() => {
    try {
      return normalizeDSL(dsl);
    } catch {
      return dsl;
    }
  }, [dsl]);

  const patchScene = (patch: Partial<Scene>) => {
    const idx = Math.min(selected, dsl.scenes.length - 1);
    const scenes = dsl.scenes.map((s, i) => (i === idx ? ({ ...s, ...patch } as Scene) : s));
    const duration = scenes.reduce((m, s) => Math.max(m, s.startTime + s.duration), 0);
    onChange({ ...dsl, scenes, duration });
  };

  const rewriteBeat = async () => {
    if (!scene || !rewriteInstr.trim() || rewriting) return;
    setRewriting(true);
    setRewriteErr('');
    try {
      const res = await fetch('/api/rewrite-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene,
          instruction: rewriteInstr.trim(),
          lessonTitle: dsl.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rewrite failed');
      const idx = Math.min(selected, dsl.scenes.length - 1);
      const scenes = dsl.scenes.map((s, i) => (i === idx ? (data.scene as Scene) : s));
      const duration = scenes.reduce((m, s) => Math.max(m, s.startTime + s.duration), 0);
      onChange({ ...dsl, scenes, duration });
      setRewriteOpen(false);
      setRewriteInstr('');
    } catch (e) {
      setRewriteErr(e instanceof Error ? e.message : 'Rewrite failed');
    } finally {
      setRewriting(false);
    }
  };

  return (
    <div className="studio studio-v2">
      <header className="studio-top">
        <div className="studio-top-left">
          <span className="studio-mark">◆</span>
          <div>
            <input
              className="studio-title-input"
              value={dsl.title}
              onChange={(e) => onChange({ ...dsl, title: e.target.value })}
              placeholder="Lesson title"
            />
            <div className="studio-sub">
              Scene-by-scene course studio · {dsl.scenes.length} beats · {Math.round(dsl.duration)}s
            </div>
          </div>
        </div>
        <div className="studio-top-right">
          <button type="button" className="studio-btn" onClick={() => setSettingsOpen((v) => !v)}>
            <Settings2 size={14} /> Lesson look
          </button>
          <button
            type="button"
            className="studio-btn"
            onClick={() => setQaNotes(runVisualQA(liveDsl, dsl.title))}
          >
            <Sparkles size={14} /> Check lesson
          </button>
          {onClose && (
            <button type="button" className="studio-btn" onClick={onClose}>
              Back
            </button>
          )}
        </div>
      </header>

      {settingsOpen && (
        <div className="studio-settings">
          <ThemeSwatches
            label="Whole-lesson theme"
            value={typeof dsl.theme === 'string' ? dsl.theme : 'midnight'}
            onChange={(theme) => onChange({ ...dsl, theme })}
          />
          <label className="studio-field">
            <span>Brand name</span>
            <input
              value={dsl.brand?.name || ''}
              onChange={(e) =>
                onChange({ ...dsl, brand: { ...dsl.brand, name: e.target.value, accent: dsl.brand?.accent } })
              }
            />
          </label>
          <label className="studio-field">
            <span>Brand accent</span>
            <input
              type="color"
              value={dsl.brand?.accent || '#a78bfa'}
              onChange={(e) =>
                onChange({
                  ...dsl,
                  brand: { ...dsl.brand, accent: e.target.value, name: dsl.brand?.name || dsl.title },
                })
              }
            />
          </label>
          <label className="studio-field">
            <span>Narration voice</span>
            <select
              value={dsl.voice || 'af_heart'}
              onChange={(e) => onChange({ ...dsl, voice: e.target.value })}
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="studio-field studio-check">
            <input
              type="checkbox"
              checked={dsl.captions !== false}
              onChange={(e) => onChange({ ...dsl, captions: e.target.checked })}
            />
            <span>Burn-in captions</span>
          </label>
          <label className="studio-field studio-check">
            <input
              type="checkbox"
              checked={dsl.sfx !== false}
              onChange={(e) => onChange({ ...dsl, sfx: e.target.checked })}
            />
            <span>Sound effects (keys, clicks, whooshes)</span>
          </label>
        </div>
      )}

      {qaNotes.length > 0 && (
        <ul className="studio-qa">
          {qaNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      <div className="studio-body-v2">
        <aside className="studio-rail">
          <SceneTimeline
            dsl={dsl}
            selected={selected}
            onSelect={(i) => {
              setSelected(i);
              setTab('content');
            }}
            onChange={onChange}
          />
        </aside>

        <section className="studio-inspector-pane">
          {scene ? (
            <>
              <div className="insp-head">
                <div>
                  <div className="insp-kicker">{sceneTypeLabel(scene.type)}</div>
                  <h3>{sceneBeatTitle(scene, selected)}</h3>
                </div>
                <div className="insp-head-actions">
                  <button
                    type="button"
                    className="studio-btn"
                    onClick={() => {
                      setRewriteOpen((v) => !v);
                      setRewriteErr('');
                    }}
                  >
                    <Wand2 size={14} /> Rewrite this beat…
                  </button>
                  <span className="insp-badge">Editing beat {selected + 1}</span>
                </div>
              </div>
              {rewriteOpen && (
                <div className="studio-rewrite">
                  <label className="studio-field studio-field-wide">
                    <span>What should change?</span>
                    <textarea
                      rows={2}
                      value={rewriteInstr}
                      onChange={(e) => setRewriteInstr(e.target.value)}
                      placeholder="e.g. add a while loop that sums to 10"
                    />
                  </label>
                  {rewriteErr && <p className="studio-hint" style={{ color: '#f87171' }}>{rewriteErr}</p>}
                  <button
                    type="button"
                    className="studio-btn"
                    disabled={rewriting || !rewriteInstr.trim()}
                    onClick={rewriteBeat}
                  >
                    {rewriting ? 'Rewriting…' : 'Apply AI rewrite'}
                  </button>
                </div>
              )}
              <InspectorTabs tab={tab} onTab={setTab} />
              <div className="insp-body">
                <SceneInspector scene={scene} tab={tab} onChange={patchScene} />
              </div>
            </>
          ) : (
            <p className="studio-hint">Add a scene to start customizing.</p>
          )}
        </section>

        <main className="studio-preview-pane">
          <div className="preview-badge">
            Preview · {scene ? sceneBeatTitle(scene, selected) : '—'}
          </div>
          <Player
            dsl={liveDsl}
            focusSceneIndex={selected}
            showTranscript={false}
          />
        </main>
      </div>
    </div>
  );
}

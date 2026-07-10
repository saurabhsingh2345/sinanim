import React, { useState } from 'react';
import {
  BulletsScene,
  ChallengeScene,
  ChapterScene,
  DiagramScene,
  MascotScene,
  QuizScene,
  QuoteScene,
  TitleScene,
} from '@/lib/types';
import { THEME_PACKS, listThemePacks } from '@/lib/themes';

type Tab = 'content' | 'voice' | 'look';

export function InspectorTabs({
  tab,
  onTab,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  return (
    <div className="insp-tabs">
      {([
        ['content', 'On screen'],
        ['voice', 'Voiceover'],
        ['look', 'Look & timing'],
      ] as const).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={tab === id ? 'on' : ''}
          onClick={() => onTab(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function useInspectorTab() {
  const [tab, setTab] = useState<Tab>('content');
  return { tab, setTab };
}

export function VoiceFields({
  narration,
  onChange,
}: {
  narration?: string;
  onChange: (narration: string) => void;
}) {
  const words = (narration || '').trim().split(/\s+/).filter(Boolean).length;
  return (
    <label className="studio-field studio-field-wide">
      <span>What the tutor says ({words} words)</span>
      <textarea
        rows={5}
        value={narration || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write 2–4 friendly spoken sentences. Spell things the way you'd say them."
      />
      <span className="studio-hint">Aim for 30+ words on teaching beats. Short sentences work best for TTS.</span>
    </label>
  );
}

export function LookFields({
  theme,
  transition,
  duration,
  onChange,
}: {
  theme?: string;
  transition?: string;
  duration: number;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="studio-shared">
      <ThemeSwatches value={typeof theme === 'string' ? theme : 'midnight'} onChange={(theme) => onChange({ theme })} />
      <label className="studio-field">
        <span>How it enters</span>
        <select value={transition || 'fade'} onChange={(e) => onChange({ transition: e.target.value })}>
          <option value="none">Cut</option>
          <option value="fade">Fade</option>
          <option value="slide">Slide</option>
          <option value="push">Push</option>
          <option value="zoom">Zoom</option>
        </select>
      </label>
      <label className="studio-field">
        <span>Length (seconds)</span>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={duration}
          onChange={(e) => onChange({ duration: Number(e.target.value) || 1 })}
        />
      </label>
    </div>
  );
}

export function ThemeSwatches({
  value,
  onChange,
  label = 'Color theme',
}: {
  value?: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const packs = listThemePacks();
  return (
    <div className="studio-field studio-field-wide">
      <span>{label}</span>
      <div className="theme-swatches">
        {packs.map((p) => {
          const pack = THEME_PACKS[p.id];
          return (
            <button
              key={p.id}
              type="button"
              className={`theme-swatch ${value === p.id ? 'on' : ''}`}
              title={p.label}
              onClick={() => onChange(p.id)}
              style={{
                background: `linear-gradient(135deg, ${pack.background} 40%, ${pack.accent} 100%)`,
              }}
            >
              <em>{p.label}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TitleEditor({
  scene,
  onChange,
  tab,
}: {
  scene: TitleScene;
  onChange: (p: Partial<TitleScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<TitleScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Headline</span>
        <input value={scene.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Subtitle</span>
        <input value={scene.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} />
      </label>
    </>
  );
}

export function ChapterEditor({
  scene,
  onChange,
  tab,
}: {
  scene: ChapterScene;
  onChange: (p: Partial<ChapterScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<ChapterScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field">
        <span>Chapter number</span>
        <input
          type="number"
          value={scene.number ?? 1}
          onChange={(e) => onChange({ number: Number(e.target.value) || 1 })}
        />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Section title</span>
        <input value={scene.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
    </>
  );
}

export function BulletsEditor({
  scene,
  onChange,
  tab,
}: {
  scene: BulletsScene;
  onChange: (p: Partial<BulletsScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<BulletsScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>List title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Points (reveal one by one)</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() => onChange({ items: [...scene.items, 'New point'] })}
          >
            + Point
          </button>
        </div>
        {scene.items.map((item, i) => (
          <div key={i} className="studio-row">
            <span className="studio-badge">{i + 1}</span>
            <input
              value={item}
              onChange={(e) => {
                const items = scene.items.map((x, idx) => (idx === i ? e.target.value : x));
                onChange({ items });
              }}
            />
            <button
              type="button"
              className="studio-btn danger"
              onClick={() => onChange({ items: scene.items.filter((_, idx) => idx !== i) })}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function QuizEditor({
  scene,
  onChange,
  tab,
}: {
  scene: QuizScene;
  onChange: (p: Partial<QuizScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<QuizScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Question</span>
        <textarea rows={2} value={scene.question} onChange={(e) => onChange({ question: e.target.value })} />
      </label>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Answer choices</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() => onChange({ options: [...scene.options, 'New option'] })}
          >
            + Option
          </button>
        </div>
        {scene.options.map((opt, i) => (
          <div key={i} className="studio-row">
            <input
              type="radio"
              name="quiz-answer"
              checked={scene.answerIndex === i}
              onChange={() => onChange({ answerIndex: i })}
              title="Mark as correct"
            />
            <input
              value={opt}
              onChange={(e) => {
                const options = scene.options.map((x, idx) => (idx === i ? e.target.value : x));
                onChange({ options });
              }}
            />
            <button
              type="button"
              className="studio-btn danger"
              onClick={() => {
                const options = scene.options.filter((_, idx) => idx !== i);
                const answerIndex =
                  scene.answerIndex === i ? 0 : scene.answerIndex > i ? scene.answerIndex - 1 : scene.answerIndex;
                onChange({ options, answerIndex });
              }}
            >
              ×
            </button>
          </div>
        ))}
        <p className="studio-hint">Select the radio next to the correct answer.</p>
      </div>
      <label className="studio-field studio-field-wide">
        <span>Explanation (shown after answering)</span>
        <textarea rows={2} value={scene.explanation || ''} onChange={(e) => onChange({ explanation: e.target.value })} />
      </label>
    </>
  );
}

export function MascotEditor({
  scene,
  onChange,
  tab,
}: {
  scene: MascotScene;
  onChange: (p: Partial<MascotScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<MascotScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field">
        <span>Bit&apos;s action</span>
        <select
          value={scene.action}
          onChange={(e) => onChange({ action: e.target.value as MascotScene['action'] })}
        >
          <option value="wave">Wave hello</option>
          <option value="point">Point at a line</option>
          <option value="think">Think / puzzled</option>
          <option value="celebrate">Celebrate</option>
          <option value="shocked">Shocked</option>
          <option value="idle">Idle</option>
        </select>
      </label>
      <label className="studio-field">
        <span>Point at line #</span>
        <input
          type="number"
          value={scene.line ?? ''}
          onChange={(e) => onChange({ line: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </label>
      <label className="studio-field">
        <span>Stand on</span>
        <select
          value={scene.side || 'right'}
          onChange={(e) => onChange({ side: e.target.value as 'left' | 'right' })}
        >
          <option value="right">Right</option>
          <option value="left">Left</option>
        </select>
      </label>
    </>
  );
}

export function ChallengeEditor({
  scene,
  onChange,
  tab,
}: {
  scene: ChallengeScene;
  onChange: (p: Partial<ChallengeScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<ChallengeScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Challenge prompt</span>
        <textarea rows={2} value={scene.prompt} onChange={(e) => onChange({ prompt: e.target.value })} />
      </label>
      <label className="studio-field">
        <span>Language</span>
        <select value={scene.language} onChange={(e) => onChange({ language: e.target.value })}>
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
        </select>
      </label>
      <label className="studio-field studio-field-wide">
        <span>Starter code</span>
        <textarea rows={4} value={scene.starterCode} onChange={(e) => onChange({ starterCode: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Solution</span>
        <textarea rows={4} value={scene.solution} onChange={(e) => onChange({ solution: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Hint</span>
        <input value={scene.hint || ''} onChange={(e) => onChange({ hint: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Concept tag</span>
        <input
          value={scene.concept || ''}
          onChange={(e) => onChange({ concept: e.target.value })}
          placeholder="e.g. for loops"
        />
      </label>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Tests</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() =>
              onChange({
                tests: [...(scene.tests || []), { expression: 'fn(1)', expected: '1' }],
              })
            }
          >
            + Test
          </button>
        </div>
        {(scene.tests || []).map((t, i) => (
          <div key={i} className="studio-card">
            <div className="studio-row">
              <span className="studio-badge">#{i + 1}</span>
              <button
                type="button"
                className="studio-btn danger"
                onClick={() => onChange({ tests: scene.tests.filter((_, idx) => idx !== i) })}
              >
                ×
              </button>
            </div>
            <input
              value={t.expression}
              onChange={(e) => {
                const tests = scene.tests.map((x, idx) =>
                  idx === i ? { ...x, expression: e.target.value } : x,
                );
                onChange({ tests });
              }}
              placeholder="Expression to evaluate, e.g. sum_to(3)"
            />
            <input
              value={t.expected}
              onChange={(e) => {
                const tests = scene.tests.map((x, idx) =>
                  idx === i ? { ...x, expected: e.target.value } : x,
                );
                onChange({ tests });
              }}
              placeholder="Expected printed result"
            />
          </div>
        ))}
      </div>
    </>
  );
}

export function QuoteEditor({
  scene,
  onChange,
  tab,
}: {
  scene: QuoteScene;
  onChange: (p: Partial<QuoteScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<QuoteScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Quote</span>
        <textarea rows={3} value={scene.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Attribution</span>
        <input value={scene.attribution || ''} onChange={(e) => onChange({ attribution: e.target.value })} />
      </label>
    </>
  );
}

export function DiagramEditor({
  scene,
  onChange,
  tab,
}: {
  scene: DiagramScene;
  onChange: (p: Partial<DiagramScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <>
        <LookFields
          theme={typeof scene.theme === 'string' ? scene.theme : undefined}
          transition={scene.transition}
          duration={scene.duration}
          onChange={(p) => onChange(p as Partial<DiagramScene>)}
        />
        <label className="studio-field">
          <span>Drawing style</span>
          <select
            value={scene.aesthetic || 'clean'}
            onChange={(e) => onChange({ aesthetic: e.target.value as 'clean' | 'sketch' })}
          >
            <option value="clean">Clean</option>
            <option value="sketch">Hand-drawn sketch</option>
          </select>
        </label>
      </>
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Diagram title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Nodes</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() =>
              onChange({
                nodes: [
                  ...scene.nodes,
                  { id: `n${scene.nodes.length + 1}`, label: 'Node', x: 0.5, y: 0.5 },
                ],
              })
            }
          >
            + Node
          </button>
        </div>
        {scene.nodes.map((n, i) => (
          <div key={n.id} className="studio-card">
            <div className="studio-row">
              <input
                value={n.label}
                onChange={(e) => {
                  const nodes = scene.nodes.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x));
                  onChange({ nodes });
                }}
              />
              <button
                type="button"
                className="studio-btn danger"
                onClick={() => onChange({ nodes: scene.nodes.filter((_, idx) => idx !== i) })}
              >
                ×
              </button>
            </div>
            <div className="studio-row">
              <label className="studio-field">
                <span>X</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={n.x}
                  onChange={(e) => {
                    const nodes = scene.nodes.map((x, idx) =>
                      idx === i ? { ...x, x: Number(e.target.value) } : x,
                    );
                    onChange({ nodes });
                  }}
                />
              </label>
              <label className="studio-field">
                <span>Y</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={n.y}
                  onChange={(e) => {
                    const nodes = scene.nodes.map((x, idx) =>
                      idx === i ? { ...x, y: Number(e.target.value) } : x,
                    );
                    onChange({ nodes });
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Edges</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() =>
              onChange({
                edges: [
                  ...(scene.edges || []),
                  {
                    from: scene.nodes[0]?.id || 'a',
                    to: scene.nodes[1]?.id || scene.nodes[0]?.id || 'b',
                    label: '',
                  },
                ],
              })
            }
          >
            + Edge
          </button>
        </div>
        {(scene.edges || []).map((e, i) => (
          <div key={i} className="studio-card">
            <div className="studio-row">
              <select
                value={e.from}
                onChange={(ev) => {
                  const edges = scene.edges.map((x, idx) =>
                    idx === i ? { ...x, from: ev.target.value } : x,
                  );
                  onChange({ edges });
                }}
              >
                {scene.nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.label || n.id}</option>
                ))}
              </select>
              <span className="studio-hint">→</span>
              <select
                value={e.to}
                onChange={(ev) => {
                  const edges = scene.edges.map((x, idx) =>
                    idx === i ? { ...x, to: ev.target.value } : x,
                  );
                  onChange({ edges });
                }}
              >
                {scene.nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.label || n.id}</option>
                ))}
              </select>
              <button
                type="button"
                className="studio-btn danger"
                onClick={() => onChange({ edges: scene.edges.filter((_, idx) => idx !== i) })}
              >
                ×
              </button>
            </div>
            <input
              value={e.label || ''}
              onChange={(ev) => {
                const edges = scene.edges.map((x, idx) =>
                  idx === i ? { ...x, label: ev.target.value } : x,
                );
                onChange({ edges });
              }}
              placeholder="Optional edge label"
            />
          </div>
        ))}
      </div>
    </>
  );
}

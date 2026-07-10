import React from 'react';
import {
  BigStatScene,
  CodeScene,
  DiffScene,
  TerminalScene,
  VizScene,
  VizStep,
} from '@/lib/types';
import { LookFields, VoiceFields } from './TeachingEditors';

type Tab = 'content' | 'voice' | 'look';

export function CodeEditor({
  scene,
  onChange,
  tab,
}: {
  scene: CodeScene;
  onChange: (p: Partial<CodeScene>) => void;
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
          onChange={(p) => onChange(p as Partial<CodeScene>)}
        />
        <label className="studio-field">
          <span>Typing speed (chars/sec)</span>
          <input
            type="number"
            min={10}
            max={120}
            value={scene.typingSpeed}
            onChange={(e) => onChange({ typingSpeed: Number(e.target.value) || 40 })}
          />
        </label>
        <label className="studio-field">
          <span>Font size</span>
          <input
            type="number"
            min={12}
            max={48}
            value={scene.fontSize || 22}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) || 22 })}
          />
        </label>
      </>
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="studio-field">
        <span>Language</span>
        <select value={scene.language} onChange={(e) => onChange({ language: e.target.value })}>
          {['python', 'javascript', 'typescript', 'tsx', 'html', 'css', 'json', 'bash'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="studio-field studio-field-wide">
        <span>Code</span>
        <textarea rows={12} value={scene.code} onChange={(e) => onChange({ code: e.target.value })} />
      </label>
    </>
  );
}

export function DiffEditor({
  scene,
  onChange,
  tab,
}: {
  scene: DiffScene;
  onChange: (p: Partial<DiffScene>) => void;
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
          onChange={(p) => onChange(p as Partial<DiffScene>)}
        />
        <label className="studio-field">
          <span>Typing speed (chars/sec)</span>
          <input
            type="number"
            min={10}
            max={120}
            value={scene.typingSpeed}
            onChange={(e) => onChange({ typingSpeed: Number(e.target.value) || 40 })}
          />
        </label>
      </>
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="studio-field">
        <span>Language</span>
        <select value={scene.language} onChange={(e) => onChange({ language: e.target.value })}>
          {['python', 'javascript', 'typescript', 'tsx', 'html', 'css'].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="studio-field studio-field-wide">
        <span>Before</span>
        <textarea rows={7} value={scene.before} onChange={(e) => onChange({ before: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>After</span>
        <textarea rows={7} value={scene.after} onChange={(e) => onChange({ after: e.target.value })} />
      </label>
    </>
  );
}

export function TerminalEditor({
  scene,
  onChange,
  tab,
}: {
  scene: TerminalScene;
  onChange: (p: Partial<TerminalScene>) => void;
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
          onChange={(p) => onChange(p as Partial<TerminalScene>)}
        />
        <label className="studio-field">
          <span>Typing speed (chars/sec)</span>
          <input
            type="number"
            min={10}
            max={120}
            value={scene.typingSpeed}
            onChange={(e) => onChange({ typingSpeed: Number(e.target.value) || 40 })}
          />
        </label>
      </>
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Prompt</span>
        <input value={scene.prompt || '$ '} onChange={(e) => onChange({ prompt: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Command (optional)</span>
        <input value={scene.command || ''} onChange={(e) => onChange({ command: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Output</span>
        <textarea rows={8} value={scene.output} onChange={(e) => onChange({ output: e.target.value })} />
      </label>
    </>
  );
}

export function BigStatEditor({
  scene,
  onChange,
  tab,
}: {
  scene: BigStatScene;
  onChange: (p: Partial<BigStatScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<BigStatScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Big value</span>
        <input value={scene.value} onChange={(e) => onChange({ value: e.target.value })} placeholder="10x" />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Label</span>
        <input value={scene.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
    </>
  );
}

function emptyVizStep(): VizStep {
  return { caption: 'Next step', array: ['1', '2', '3'], highlight: [0], vars: { i: '0' } };
}

export function VizEditor({
  scene,
  onChange,
  tab,
}: {
  scene: VizScene;
  onChange: (p: Partial<VizScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<VizScene>)}
      />
    );
  }

  const updateStep = (i: number, patch: Partial<VizStep>) => {
    onChange({ steps: scene.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  };

  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="studio-field">
        <span>Focus</span>
        <select
          value={scene.vizKind || 'array'}
          onChange={(e) => onChange({ vizKind: e.target.value as VizScene['vizKind'] })}
        >
          <option value="array">Array</option>
          <option value="vars">Variables</option>
          <option value="stack">Stack</option>
        </select>
      </label>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Animation steps</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() => onChange({ steps: [...scene.steps, emptyVizStep()] })}
          >
            + Step
          </button>
        </div>
        {scene.steps.map((st, i) => (
          <div key={i} className="studio-card">
            <div className="studio-row">
              <span className="studio-badge">Step {i + 1}</span>
              <button
                type="button"
                className="studio-btn danger"
                onClick={() => onChange({ steps: scene.steps.filter((_, idx) => idx !== i) })}
              >
                ×
              </button>
            </div>
            <input
              value={st.caption || ''}
              onChange={(e) => updateStep(i, { caption: e.target.value })}
              placeholder="Caption for this step"
            />
            <label className="studio-field studio-field-wide">
              <span>Array cells (comma-separated)</span>
              <input
                value={(st.array || []).join(', ')}
                onChange={(e) =>
                  updateStep(i, {
                    array: e.target.value.split(',').map((x) => x.trim()).filter((x) => x.length),
                  })
                }
              />
            </label>
            <label className="studio-field studio-field-wide">
              <span>Highlight indices (comma-separated)</span>
              <input
                value={(st.highlight || []).join(', ')}
                onChange={(e) =>
                  updateStep(i, {
                    highlight: e.target.value
                      .split(',')
                      .map((x) => Number(x.trim()))
                      .filter((n) => Number.isFinite(n)),
                  })
                }
              />
            </label>
            <label className="studio-field studio-field-wide">
              <span>Variables (name=value, one per line)</span>
              <textarea
                rows={3}
                value={Object.entries(st.vars || {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join('\n')}
                onChange={(e) => {
                  const vars: Record<string, string> = {};
                  for (const line of e.target.value.split('\n')) {
                    const m = line.match(/^\s*([^=]+)=(.*)$/);
                    if (m) vars[m[1].trim()] = m[2].trim();
                  }
                  updateStep(i, { vars });
                }}
              />
            </label>
            <label className="studio-field studio-field-wide">
              <span>Stack (bottom → top, one per line)</span>
              <textarea
                rows={2}
                value={(st.stack || []).join('\n')}
                onChange={(e) =>
                  updateStep(i, {
                    stack: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean),
                  })
                }
              />
            </label>
            <label className="studio-field studio-field-wide">
              <span>Pointers (name:index, comma-separated)</span>
              <input
                value={(st.pointers || []).map((p) => `${p.name}:${p.index}`).join(', ')}
                onChange={(e) => {
                  const pointers = e.target.value
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .map((part) => {
                      const [name, idx] = part.split(':');
                      return { name: (name || 'i').trim(), index: Number(idx) || 0 };
                    });
                  updateStep(i, { pointers });
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </>
  );
}

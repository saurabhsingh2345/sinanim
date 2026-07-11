import React from 'react';
import { IdeAction, IdeFile, IdeScene, IdeStep } from '@/lib/types';
import { LookFields, VoiceFields } from './TeachingEditors';

const ACTION_LABELS: Record<IdeAction['kind'], string> = {
  open: 'Open a file',
  create: 'Create a new file',
  type: 'Type code into a file',
  run: 'Run a terminal command',
  highlight: 'Highlight lines',
  explain: 'Explain (hold + teach)',
};

type Tab = 'content' | 'voice' | 'look';

export function IdeEditor({
  scene,
  onChange,
  tab,
}: {
  scene: IdeScene;
  onChange: (patch: Partial<IdeScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') {
    return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  }
  if (tab === 'look') {
    return (
      <>
        <LookFields
          theme={typeof scene.theme === 'string' ? scene.theme : undefined}
          transition={scene.transition}
          duration={scene.duration}
          onChange={(p) => onChange(p as Partial<IdeScene>)}
        />
        <label className="studio-field">
          <span>Git branch (status bar)</span>
          <input
            value={scene.branch || ''}
            onChange={(e) => onChange({ branch: e.target.value || undefined })}
            placeholder="main"
          />
        </label>
        <label className="studio-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={scene.showMenu !== false}
            onChange={(e) => onChange({ showMenu: e.target.checked })}
          />
          <span>Show menu bar (File Edit View…)</span>
        </label>
      </>
    );
  }

  const updateFile = (i: number, patch: Partial<IdeFile>) => {
    onChange({ files: scene.files.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  };
  const updateStep = (i: number, patch: Partial<IdeStep>) => {
    onChange({ steps: scene.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  };
  const setAction = (i: number, action: IdeAction) => updateStep(i, { action });
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= scene.steps.length) return;
    const steps = [...scene.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    onChange({ steps });
  };

  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Project name (shown in the explorer)</span>
        <input value={scene.project || ''} onChange={(e) => onChange({ project: e.target.value })} placeholder="todo-api" />
      </label>
      <label className="studio-field">
        <span>Branch</span>
        <input value={scene.branch || ''} onChange={(e) => onChange({ branch: e.target.value || undefined })} placeholder="main" />
      </label>

      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Files in the folder tree</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() =>
              onChange({
                files: [...scene.files, { path: `src/file${scene.files.length + 1}.ts`, language: 'typescript', code: '' }],
              })
            }
          >
            + File
          </button>
        </div>
        <p className="studio-hint">Use paths like <code>models/todo.py</code> — folders appear automatically.</p>
        {scene.files.map((f, i) => (
          <div key={i} className="studio-card">
            <div className="studio-row">
              <input value={f.path} onChange={(e) => updateFile(i, { path: e.target.value })} placeholder="src/app.py" />
              <select
                value={f.language || 'text'}
                onChange={(e) => updateFile(i, { language: e.target.value })}
                style={{ maxWidth: 110 }}
              >
                {['python', 'javascript', 'typescript', 'tsx', 'html', 'css', 'json', 'text'].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button type="button" className="studio-btn danger" onClick={() => onChange({ files: scene.files.filter((_, idx) => idx !== i) })}>×</button>
            </div>
            <textarea rows={5} value={f.code || ''} onChange={(e) => updateFile(i, { code: e.target.value })} placeholder="Starting contents (often empty — typed in a step)" />
          </div>
        ))}
      </div>

      <div className="studio-section">
        <div className="studio-section-head">
          <strong>What happens, step by step</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() =>
              onChange({
                steps: [...scene.steps, { caption: 'Next beat', action: { kind: 'open', file: scene.files[0]?.path || 'main.py' } }],
              })
            }
          >
            + Step
          </button>
        </div>
        {scene.steps.map((st, i) => {
          const action = st.action;
          return (
            <div key={i} className="studio-card">
              <div className="studio-row">
                <span className="studio-badge">Step {i + 1}</span>
                <button type="button" className="studio-btn" onClick={() => moveStep(i, -1)} title="Move up">↑</button>
                <button type="button" className="studio-btn" onClick={() => moveStep(i, 1)} title="Move down">↓</button>
                <button type="button" className="studio-btn danger" onClick={() => onChange({ steps: scene.steps.filter((_, idx) => idx !== i) })}>×</button>
              </div>
              <label className="studio-field studio-field-wide">
                <span>This step will…</span>
                <select
                  value={action.kind}
                  onChange={(e) => {
                    const kind = e.target.value as IdeAction['kind'];
                    const file = ('file' in action ? action.file : scene.files[0]?.path) || 'main.py';
                    if (kind === 'open' || kind === 'create') setAction(i, { kind, file });
                    else if (kind === 'type') setAction(i, { kind, file, code: '' });
                    else if (kind === 'run') setAction(i, { kind, command: 'python main.py', output: '' });
                    else setAction(i, { kind: 'highlight', startLine: 1, endLine: 1 });
                  }}
                >
                  {(Object.keys(ACTION_LABELS) as IdeAction['kind'][]).map((k) => (
                    <option key={k} value={k}>{ACTION_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              <input value={st.caption || ''} onChange={(e) => updateStep(i, { caption: e.target.value })} placeholder="On-screen caption for this step" />
              {'file' in action && (
                <input value={action.file} onChange={(e) => setAction(i, { ...action, file: e.target.value } as IdeAction)} placeholder="Which file?" />
              )}
              {action.kind === 'type' && (
                <>
                  <textarea rows={6} value={action.code} onChange={(e) => setAction(i, { kind: 'type', file: action.file, code: e.target.value, typingSpeed: action.typingSpeed })} placeholder="Full file contents after typing…" />
                  <label className="studio-field">
                    <span>Typing speed (chars/sec, optional)</span>
                    <input
                      type="number"
                      min={10}
                      max={120}
                      value={action.typingSpeed ?? ''}
                      onChange={(e) =>
                        setAction(i, {
                          kind: 'type',
                          file: action.file,
                          code: action.code,
                          typingSpeed: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="default"
                    />
                  </label>
                </>
              )}
              {action.kind === 'run' && (
                <>
                  <input value={action.command} onChange={(e) => setAction(i, { kind: 'run', command: e.target.value, output: action.output })} placeholder="Command to run" />
                  <textarea rows={3} value={action.output || ''} onChange={(e) => setAction(i, { kind: 'run', command: action.command, output: e.target.value })} placeholder="What the terminal prints" />
                </>
              )}
              {action.kind === 'highlight' && (
                <div className="studio-row">
                  <label className="studio-field">
                    <span>From line</span>
                    <input type="number" value={action.startLine} onChange={(e) => setAction(i, { kind: 'highlight', file: action.file, startLine: Number(e.target.value) || 1, endLine: action.endLine })} />
                  </label>
                  <label className="studio-field">
                    <span>To line</span>
                    <input type="number" value={action.endLine} onChange={(e) => setAction(i, { kind: 'highlight', file: action.file, startLine: action.startLine, endLine: Number(e.target.value) || 1 })} />
                  </label>
                </div>
              )}
              <div className="studio-row">
                <label className="studio-field">
                  <span>Step weight</span>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={st.weight ?? 1}
                    onChange={(e) => updateStep(i, { weight: Number(e.target.value) || 1 })}
                  />
                </label>
                <input value={st.key || ''} onChange={(e) => updateStep(i, { key: e.target.value || undefined })} placeholder="Optional shortcut chip, e.g. ⌘S" />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

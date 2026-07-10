import React from 'react';
import { ApiScene, CliScene, LayoutScene, PrScene, SplitScene, SplitStep, BrowserBlock } from '@/lib/types';
import { LookFields, VoiceFields } from './TeachingEditors';
import { IdeEditor } from './IdeEditor';
import { BrowserEditor } from './BrowserEditor';

type Tab = 'content' | 'voice' | 'look';

export function CliEditor({
  scene,
  onChange,
  tab,
}: {
  scene: CliScene;
  onChange: (patch: Partial<CliScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(n) => onChange({ narration: n })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<CliScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Window title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} placeholder="zsh — ~/project" />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Working folder (shown in the prompt)</span>
        <input value={scene.cwd || ''} onChange={(e) => onChange({ cwd: e.target.value })} placeholder="~/my-app" />
      </label>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Commands</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() => onChange({ commands: [...scene.commands, { command: 'echo hello', output: 'hello' }] })}
          >
            + Command
          </button>
        </div>
        {scene.commands.map((c, i) => (
          <div key={i} className="studio-card">
            <div className="studio-row">
              <span className="studio-badge">#{i + 1}</span>
              <button
                type="button"
                className="studio-btn danger"
                onClick={() => onChange({ commands: scene.commands.filter((_, idx) => idx !== i) })}
              >
                ×
              </button>
            </div>
            <input
              value={c.command}
              onChange={(e) => {
                const commands = scene.commands.map((x, idx) => (idx === i ? { ...x, command: e.target.value } : x));
                onChange({ commands });
              }}
              placeholder="Command typed at the prompt"
            />
            <textarea
              rows={3}
              value={c.output || ''}
              onChange={(e) => {
                const commands = scene.commands.map((x, idx) => (idx === i ? { ...x, output: e.target.value } : x));
                onChange({ commands });
              }}
              placeholder="What prints afterward"
            />
            <label className="studio-field">
              <span>Step weight</span>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={c.weight ?? 1}
                onChange={(e) => {
                  const commands = scene.commands.map((x, idx) =>
                    idx === i ? { ...x, weight: Number(e.target.value) || 1 } : x,
                  );
                  onChange({ commands });
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </>
  );
}

export function ApiEditor({
  scene,
  onChange,
  tab,
}: {
  scene: ApiScene;
  onChange: (patch: Partial<ApiScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(n) => onChange({ narration: n })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<ApiScene>)}
      />
    );
  }
  return (
    <>
      <div className="studio-row">
        <label className="studio-field">
          <span>Method</span>
          <select value={scene.method} onChange={(e) => onChange({ method: e.target.value })}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="studio-field studio-field-wide">
          <span>URL</span>
          <input value={scene.url} onChange={(e) => onChange({ url: e.target.value })} />
        </label>
      </div>
      <label className="studio-field studio-field-wide">
        <span>Request body</span>
        <textarea rows={3} value={scene.requestBody || ''} onChange={(e) => onChange({ requestBody: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Headers (Name: value, one per line)</span>
        <textarea
          rows={3}
          value={Object.entries(scene.headers || {})
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')}
          onChange={(e) => {
            const headers: Record<string, string> = {};
            for (const line of e.target.value.split('\n')) {
              const m = line.match(/^\s*([^:]+):\s*(.*)$/);
              if (m) headers[m[1].trim()] = m[2].trim();
            }
            onChange({ headers: Object.keys(headers).length ? headers : undefined });
          }}
          placeholder="Authorization: Bearer …"
        />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Query params (key=value, one per line)</span>
        <textarea
          rows={2}
          value={Object.entries(scene.query || {})
            .map(([k, v]) => `${k}=${v}`)
            .join('\n')}
          onChange={(e) => {
            const query: Record<string, string> = {};
            for (const line of e.target.value.split('\n')) {
              const m = line.match(/^\s*([^=]+)=(.*)$/);
              if (m) query[m[1].trim()] = m[2].trim();
            }
            onChange({ query: Object.keys(query).length ? query : undefined });
          }}
          placeholder="limit=10"
        />
      </label>
      <div className="studio-row">
        <label className="studio-field">
          <span>Status code</span>
          <input type="number" value={scene.status} onChange={(e) => onChange({ status: Number(e.target.value) || 200 })} />
        </label>
        <label className="studio-field">
          <span>Status text</span>
          <input value={scene.statusText || ''} onChange={(e) => onChange({ statusText: e.target.value })} />
        </label>
      </div>
      <label className="studio-field studio-field-wide">
        <span>Response JSON</span>
        <textarea rows={5} value={scene.response} onChange={(e) => onChange({ response: e.target.value })} />
      </label>
    </>
  );
}

export function PrEditor({
  scene,
  onChange,
  tab,
}: {
  scene: PrScene;
  onChange: (patch: Partial<PrScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(n) => onChange({ narration: n })} />;
  if (tab === 'look') {
    return (
      <LookFields
        theme={typeof scene.theme === 'string' ? scene.theme : undefined}
        transition={scene.transition}
        duration={scene.duration}
        onChange={(p) => onChange(p as Partial<PrScene>)}
      />
    );
  }
  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Pull request title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Filename</span>
        <input value={scene.filename} onChange={(e) => onChange({ filename: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Before (old code)</span>
        <textarea rows={6} value={scene.before} onChange={(e) => onChange({ before: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>After (new code)</span>
        <textarea rows={6} value={scene.after} onChange={(e) => onChange({ after: e.target.value })} />
      </label>
    </>
  );
}

export function SplitEditor({
  scene,
  onChange,
  tab,
}: {
  scene: SplitScene;
  onChange: (patch: Partial<SplitScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(n) => onChange({ narration: n })} />;
  if (tab === 'look') {
    return (
      <>
        <LookFields
          theme={typeof scene.theme === 'string' && scene.theme !== 'light' && scene.theme !== 'dark' ? scene.theme : undefined}
          transition={scene.transition}
          duration={scene.duration}
          onChange={(p) => onChange(p as Partial<SplitScene>)}
        />
        <label className="studio-field">
          <span>Preview page</span>
          <select
            value={scene.pageTheme || 'light'}
            onChange={(e) => onChange({ pageTheme: e.target.value as 'light' | 'dark' })}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </>
    );
  }

  const updateStep = (i: number, patch: Partial<SplitStep>) => {
    onChange({ steps: scene.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  };

  return (
    <>
      <label className="studio-field">
        <span>Language</span>
        <input value={scene.language} onChange={(e) => onChange({ language: e.target.value })} />
      </label>
      <label className="studio-field">
        <span>Filename</span>
        <input value={scene.filename || ''} onChange={(e) => onChange({ filename: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Preview URL</span>
        <input value={scene.url || ''} onChange={(e) => onChange({ url: e.target.value })} />
      </label>
      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Steps (code → preview)</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() =>
              onChange({
                steps: [
                  ...scene.steps,
                  { caption: 'Next', code: '', blocks: [{ kind: 'text', text: 'Preview' } as BrowserBlock] },
                ],
              })
            }
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
              placeholder="Caption"
            />
            <textarea
              rows={4}
              value={st.code}
              onChange={(e) => updateStep(i, { code: e.target.value })}
              placeholder="Code on the left"
            />
            <label className="studio-field studio-field-wide">
              <span>Preview heading (quick edit)</span>
              <input
                value={
                  st.blocks.find((b) => b.kind === 'hero' || b.kind === 'text')
                    ? st.blocks.find((b) => b.kind === 'hero') && 'heading' in (st.blocks.find((b) => b.kind === 'hero') as object)
                      ? (st.blocks.find((b) => b.kind === 'hero') as { heading: string }).heading
                      : st.blocks.find((b) => b.kind === 'text') && 'text' in (st.blocks.find((b) => b.kind === 'text') as object)
                        ? (st.blocks.find((b) => b.kind === 'text') as { text: string }).text
                        : ''
                    : ''
                }
                onChange={(e) =>
                  updateStep(i, {
                    blocks: [{ kind: 'hero', heading: e.target.value }, ...st.blocks.filter((b) => b.kind !== 'hero' && b.kind !== 'text')],
                  })
                }
              />
            </label>
          </div>
        ))}
      </div>
    </>
  );
}

export function LayoutEditor({
  scene,
  onChange,
  tab,
}: {
  scene: LayoutScene;
  onChange: (patch: Partial<LayoutScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') return <VoiceFields narration={scene.narration} onChange={(n) => onChange({ narration: n })} />;
  if (tab === 'look') {
    return (
      <>
        <LookFields
          theme={typeof scene.theme === 'string' ? scene.theme : undefined}
          transition={scene.transition}
          duration={scene.duration}
          onChange={(p) => onChange(p as Partial<LayoutScene>)}
        />
        <label className="studio-field">
          <span>Layout preset</span>
          <select
            value={scene.preset || 'ide-browser'}
            onChange={(e) => onChange({ preset: e.target.value as LayoutScene['preset'] })}
          >
            <option value="ide-browser">Editor | Browser</option>
            <option value="cli-browser">Terminal | Browser</option>
            <option value="ide-cli">Editor | Terminal</option>
            <option value="ide-only">Editor only</option>
            <option value="custom">Custom</option>
          </select>
        </label>
      </>
    );
  }

  const ideRegion = scene.regions.find((r) => r.type === 'ide');
  const browserRegion = scene.regions.find((r) => r.type === 'browser');
  const cliRegion = scene.regions.find((r) => r.type === 'cli');

  return (
    <>
      <p className="studio-hint">Edit each pane below. The preview shows them side by side.</p>
      {ideRegion && (
        <div className="studio-section">
          <strong>Left / editor pane</strong>
          <IdeEditor
            tab="content"
            scene={{
              type: 'ide',
              startTime: scene.startTime,
              duration: scene.duration,
              project: ideRegion.project,
              files: ideRegion.files || [],
              steps: ideRegion.steps || [],
            }}
            onChange={(p) => {
              const regions = scene.regions.map((r) =>
                r.type === 'ide'
                  ? {
                      ...r,
                      project: p.project ?? r.project,
                      files: p.files ?? r.files,
                      steps: p.steps ?? r.steps,
                    }
                  : r,
              );
              onChange({ regions });
            }}
          />
        </div>
      )}
      {browserRegion && (
        <div className="studio-section">
          <strong>Browser pane</strong>
          <BrowserEditor
            tab="content"
            scene={{
              type: 'browser',
              startTime: scene.startTime,
              duration: scene.duration,
              url: browserRegion.url || 'localhost:3000',
              title: browserRegion.title,
              pageTheme: browserRegion.pageTheme,
              blocks: browserRegion.blocks || [],
              clickBlock: browserRegion.clickBlock,
            }}
            onChange={(p) => {
              const regions = scene.regions.map((r) =>
                r.type === 'browser'
                  ? {
                      ...r,
                      url: p.url ?? r.url,
                      title: p.title ?? r.title,
                      pageTheme: p.pageTheme ?? r.pageTheme,
                      blocks: p.blocks ?? r.blocks,
                      clickBlock: p.clickBlock ?? r.clickBlock,
                    }
                  : r,
              );
              onChange({ regions });
            }}
          />
        </div>
      )}
      {cliRegion && (
        <div className="studio-section">
          <strong>Terminal pane</strong>
          <CliEditor
            tab="content"
            scene={{
              type: 'cli',
              startTime: scene.startTime,
              duration: scene.duration,
              title: cliRegion.title,
              cwd: cliRegion.cwd,
              commands: cliRegion.commands || [],
            }}
            onChange={(p) => {
              const regions = scene.regions.map((r) =>
                r.type === 'cli'
                  ? {
                      ...r,
                      title: p.title ?? r.title,
                      cwd: p.cwd ?? r.cwd,
                      commands: p.commands ?? r.commands,
                    }
                  : r,
              );
              onChange({ regions });
            }}
          />
        </div>
      )}
    </>
  );
}

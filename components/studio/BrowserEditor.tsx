import React from 'react';
import { BrowserBlock, BrowserScene, BrowserTab } from '@/lib/types';
import { LookFields, VoiceFields } from './TeachingEditors';

const BLOCK_LABELS: Record<BrowserBlock['kind'], string> = {
  nav: 'Navigation bar',
  hero: 'Hero / headline',
  button: 'Button',
  card: 'Feature card',
  text: 'Paragraph',
  input: 'Text input',
  image: 'Image placeholder',
  code: 'Code snippet',
  html: 'Custom HTML',
  search: 'Search box',
  serp: 'Search results (SERP)',
  docs: 'Docs page',
};

function defaultBlock(kind: BrowserBlock['kind']): BrowserBlock {
  switch (kind) {
    case 'nav': return { kind: 'nav', brand: '◆ Brand', links: ['Features', 'Docs'] };
    case 'hero': return { kind: 'hero', heading: 'Headline', sub: 'Supporting line', cta: 'Get started' };
    case 'button': return { kind: 'button', label: 'Click me', primary: true };
    case 'card': return { kind: 'card', title: 'Card', body: 'Details…' };
    case 'text': return { kind: 'text', text: 'Paragraph text' };
    case 'input': return { kind: 'input', placeholder: 'Type here…' };
    case 'image': return { kind: 'image', label: 'image' };
    case 'code': return { kind: 'code', text: 'console.log("hi")' };
    case 'html': return { kind: 'html', html: '<p>Custom section</p>' };
    case 'search': return { kind: 'search', query: 'python download', engine: 'Google' };
    case 'serp':
      return {
        kind: 'serp',
        results: [
          { title: 'Download Python', url: 'https://www.python.org/downloads/', snippet: 'Download the latest version of Python.' },
          { title: 'Python Docs', url: 'https://docs.python.org/3/', snippet: 'The official Python language reference.' },
        ],
      };
    case 'docs':
      return {
        kind: 'docs',
        heading: '4. More Control Flow Tools',
        body: 'The for statement in Python differs a bit from what you may be used to in C or Pascal.',
        sidebar: ['Intro', 'for loops', 'range()', 'break'],
        active: 'for loops',
        highlight: 'for i in range(5):',
      };
  }
}

function blockLabel(b: BrowserBlock, i: number): string {
  if (b.kind === 'nav') return `Nav · ${b.brand}`;
  if (b.kind === 'hero') return `Hero · ${b.heading}`;
  if (b.kind === 'button') return `Button · ${b.label}`;
  if (b.kind === 'card') return `Card · ${b.title}`;
  if (b.kind === 'text') return `Text · ${b.text.slice(0, 24)}`;
  if (b.kind === 'search') return `Search · ${b.query.slice(0, 24)}`;
  if (b.kind === 'serp') return `SERP · ${b.results.length} results`;
  if (b.kind === 'docs') return `Docs · ${b.heading.slice(0, 24)}`;
  return `${BLOCK_LABELS[b.kind]} #${i + 1}`;
}

type Tab = 'content' | 'voice' | 'look';

export function BrowserEditor({
  scene,
  onChange,
  tab,
}: {
  scene: BrowserScene;
  onChange: (patch: Partial<BrowserScene>) => void;
  tab: Tab;
}) {
  if (tab === 'voice') {
    return <VoiceFields narration={scene.narration} onChange={(narration) => onChange({ narration })} />;
  }
  if (tab === 'look') {
    return (
      <>
        <LookFields
          theme={typeof scene.theme === 'string' && scene.theme !== 'light' && scene.theme !== 'dark' ? scene.theme : undefined}
          transition={scene.transition}
          duration={scene.duration}
          onChange={(p) => onChange(p as Partial<BrowserScene>)}
        />
        <label className="studio-field">
          <span>Page surface</span>
          <select
            value={scene.pageTheme || (scene.theme === 'dark' ? 'dark' : 'light')}
            onChange={(e) => onChange({ pageTheme: e.target.value as 'light' | 'dark' })}
          >
            <option value="light">Light page</option>
            <option value="dark">Dark page</option>
          </select>
        </label>
      </>
    );
  }

  const updateBlock = (i: number, block: BrowserBlock) => {
    onChange({ blocks: scene.blocks.map((b, idx) => (idx === i ? block : b)) });
  };
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= scene.blocks.length) return;
    const blocks = [...scene.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    onChange({ blocks });
  };
  const tabs: BrowserTab[] = scene.tabs?.length
    ? scene.tabs
    : [{ title: scene.title || 'Tab', url: scene.url, active: true }];

  return (
    <>
      <label className="studio-field studio-field-wide">
        <span>Address bar URL</span>
        <input value={scene.url} onChange={(e) => onChange({ url: e.target.value })} />
      </label>
      <label className="studio-field studio-field-wide">
        <span>Tab title</span>
        <input value={scene.title || ''} onChange={(e) => onChange({ title: e.target.value })} />
      </label>

      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Browser tabs</strong>
          <button
            type="button"
            className="studio-btn"
            onClick={() =>
              onChange({
                tabs: [...tabs, { title: 'New Tab', url: 'about:blank', active: false }],
              })
            }
          >
            + Tab
          </button>
        </div>
        {tabs.map((t, i) => (
          <div key={i} className="studio-card">
            <div className="studio-row">
              <input
                value={t.title}
                onChange={(e) => {
                  const next = tabs.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x));
                  onChange({ tabs: next, title: next.find((x) => x.active)?.title || next[0]?.title });
                }}
                placeholder="Tab title"
              />
              <label className="studio-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 90 }}>
                <input
                  type="checkbox"
                  checked={!!t.active}
                  onChange={() => {
                    const next = tabs.map((x, idx) => ({ ...x, active: idx === i }));
                    onChange({ tabs: next, title: next[i].title, url: next[i].url || scene.url });
                  }}
                />
                <span>Active</span>
              </label>
              <button
                type="button"
                className="studio-btn danger"
                onClick={() => {
                  const next = tabs.filter((_, idx) => idx !== i);
                  if (!next.length) return;
                  if (!next.some((x) => x.active)) next[0].active = true;
                  onChange({ tabs: next });
                }}
              >
                ×
              </button>
            </div>
            <input
              value={t.url || ''}
              onChange={(e) => {
                const next = tabs.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x));
                onChange({ tabs: next, ...(t.active ? { url: e.target.value } : {}) });
              }}
              placeholder="https://…"
            />
          </div>
        ))}
      </div>

      <label className="studio-field studio-field-wide">
        <span>Cursor clicks which block?</span>
        <select
          value={scene.clickBlock ?? ''}
          onChange={(e) =>
            onChange({ clickBlock: e.target.value === '' ? undefined : Number(e.target.value) })
          }
        >
          <option value="">No click</option>
          {scene.blocks.map((b, i) => (
            <option key={i} value={i}>{blockLabel(b, i)}</option>
          ))}
        </select>
      </label>

      <div className="studio-section">
        <div className="studio-section-head">
          <strong>Page sections</strong>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                onChange({ blocks: [...scene.blocks, defaultBlock(e.target.value as BrowserBlock['kind'])] });
                e.target.value = '';
              }
            }}
          >
            <option value="">+ Add section…</option>
            {(Object.keys(BLOCK_LABELS) as BrowserBlock['kind'][]).map((k) => (
              <option key={k} value={k}>{BLOCK_LABELS[k]}</option>
            ))}
          </select>
        </div>
        {scene.blocks.map((b, i) => (
          <div key={i} className="studio-card">
            <div className="studio-row">
              <span className="studio-badge">{BLOCK_LABELS[b.kind]}</span>
              <button type="button" className="studio-btn" onClick={() => moveBlock(i, -1)}>↑</button>
              <button type="button" className="studio-btn" onClick={() => moveBlock(i, 1)}>↓</button>
              <button type="button" className="studio-btn danger" onClick={() => onChange({ blocks: scene.blocks.filter((_, idx) => idx !== i) })}>×</button>
            </div>
            {b.kind === 'nav' && (
              <>
                <input value={b.brand} onChange={(e) => updateBlock(i, { ...b, brand: e.target.value })} placeholder="Brand name" />
                <input
                  value={(b.links || []).join(', ')}
                  onChange={(e) => updateBlock(i, { ...b, links: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Links, comma-separated"
                />
              </>
            )}
            {b.kind === 'hero' && (
              <>
                <input value={b.heading} onChange={(e) => updateBlock(i, { ...b, heading: e.target.value })} placeholder="Heading" />
                <input value={b.sub || ''} onChange={(e) => updateBlock(i, { ...b, sub: e.target.value })} placeholder="Subheading" />
                <input value={b.cta || ''} onChange={(e) => updateBlock(i, { ...b, cta: e.target.value })} placeholder="Button label" />
              </>
            )}
            {b.kind === 'button' && (
              <input value={b.label} onChange={(e) => updateBlock(i, { ...b, label: e.target.value })} />
            )}
            {b.kind === 'card' && (
              <>
                <input value={b.title} onChange={(e) => updateBlock(i, { ...b, title: e.target.value })} />
                <textarea rows={2} value={b.body || ''} onChange={(e) => updateBlock(i, { ...b, body: e.target.value })} />
              </>
            )}
            {b.kind === 'text' && (
              <textarea rows={2} value={b.text} onChange={(e) => updateBlock(i, { ...b, text: e.target.value })} />
            )}
            {b.kind === 'input' && (
              <>
                <input value={b.placeholder} onChange={(e) => updateBlock(i, { ...b, placeholder: e.target.value })} />
                <input value={b.value || ''} onChange={(e) => updateBlock(i, { ...b, value: e.target.value })} />
              </>
            )}
            {b.kind === 'image' && (
              <input value={b.label || ''} onChange={(e) => updateBlock(i, { ...b, label: e.target.value })} />
            )}
            {b.kind === 'code' && (
              <textarea rows={3} value={b.text} onChange={(e) => updateBlock(i, { ...b, text: e.target.value })} />
            )}
            {b.kind === 'html' && (
              <textarea rows={3} value={b.html} onChange={(e) => updateBlock(i, { ...b, html: e.target.value })} />
            )}
            {b.kind === 'search' && (
              <>
                <input value={b.engine || ''} onChange={(e) => updateBlock(i, { ...b, engine: e.target.value })} placeholder="Engine label (Google)" />
                <input value={b.query} onChange={(e) => updateBlock(i, { ...b, query: e.target.value })} placeholder="Search query" />
              </>
            )}
            {b.kind === 'serp' && (
              <textarea
                rows={6}
                value={b.results.map((r) => `${r.title} | ${r.url} | ${r.snippet}`).join('\n')}
                onChange={(e) =>
                  updateBlock(i, {
                    ...b,
                    results: e.target.value
                      .split('\n')
                      .map((ln) => ln.trim())
                      .filter(Boolean)
                      .map((ln) => {
                        const [title, url, ...rest] = ln.split('|').map((s) => s.trim());
                        return { title: title || 'Result', url: url || 'https://example.com', snippet: rest.join(' ') || '' };
                      }),
                  })
                }
                placeholder={'Title | url | snippet\nOne result per line'}
              />
            )}
            {b.kind === 'docs' && (
              <>
                <input value={b.heading} onChange={(e) => updateBlock(i, { ...b, heading: e.target.value })} placeholder="Heading" />
                <textarea rows={3} value={b.body} onChange={(e) => updateBlock(i, { ...b, body: e.target.value })} placeholder="Body" />
                <input
                  value={(b.sidebar || []).join(', ')}
                  onChange={(e) => updateBlock(i, { ...b, sidebar: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Sidebar items, comma-separated"
                />
                <input value={b.active || ''} onChange={(e) => updateBlock(i, { ...b, active: e.target.value })} placeholder="Active sidebar item" />
                <input value={b.highlight || ''} onChange={(e) => updateBlock(i, { ...b, highlight: e.target.value })} placeholder="Highlighted line" />
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

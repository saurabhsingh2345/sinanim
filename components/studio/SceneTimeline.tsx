import React, { useState } from 'react';
import { AnimationDSL, Scene } from '@/lib/types';
import {
  INSERT_CATALOG,
  blankScene,
  isOverlayScene,
  retimeScenes,
  sceneBeatTitle,
  sceneTypeLabel,
} from '@/lib/sceneMeta';
import { Copy, Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';

export function SceneTimeline({
  dsl,
  selected,
  onSelect,
  onChange,
}: {
  dsl: AnimationDSL;
  selected: number;
  onSelect: (i: number) => void;
  onChange: (dsl: AnimationDSL) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const apply = (scenes: Scene[]) => {
    const next = retimeScenes(scenes);
    onChange({
      ...dsl,
      scenes: next,
      duration: next.reduce((m, s) => Math.max(m, s.startTime + s.duration), 0),
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= dsl.scenes.length) return;
    const scenes = [...dsl.scenes];
    [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
    apply(scenes);
    onSelect(j);
  };

  const duplicate = (i: number) => {
    const scenes = [...dsl.scenes];
    scenes.splice(i + 1, 0, { ...scenes[i] });
    apply(scenes);
    onSelect(i + 1);
  };

  const remove = (i: number) => {
    if (dsl.scenes.length <= 1) return;
    const scenes = dsl.scenes.filter((_, idx) => idx !== i);
    apply(scenes);
    onSelect(Math.min(selected, scenes.length - 1));
  };

  const insert = (type: Scene['type']) => {
    const start = dsl.scenes.reduce((m, s) => Math.max(m, s.startTime + s.duration), 0) + 0.3;
    const scenes = [...dsl.scenes, blankScene(type, start)];
    apply(scenes);
    onSelect(scenes.length - 1);
    setPickerOpen(false);
  };

  const groups = [
    { id: 'teach', label: 'Teaching cards' },
    { id: 'code', label: 'Code surfaces' },
    { id: 'check', label: 'Checkpoints' },
    { id: 'overlay', label: 'Overlays' },
  ] as const;

  return (
    <div className="storyboard">
      <div className="studio-section-head">
        <strong>Lesson beats</strong>
        <button type="button" className="studio-btn primary" onClick={() => setPickerOpen(true)}>
          <Plus size={12} /> Add scene
        </button>
      </div>

      <div className="storyboard-list">
        {dsl.scenes.map((s, i) => {
          const overlay = isOverlayScene(s);
          const words = (s.narration || '').trim().split(/\s+/).filter(Boolean).length;
          return (
            <button
              key={i}
              type="button"
              className={`story-beat ${selected === i ? 'active' : ''} ${overlay ? 'overlay' : ''}`}
              onClick={() => onSelect(i)}
            >
              <span className="beat-num">{i + 1}</span>
              <span className="beat-body">
                <span className="beat-title">{sceneBeatTitle(s, i)}</span>
                <span className="beat-meta">
                  {sceneTypeLabel(s.type)}
                  {overlay ? ' · overlay' : ''}
                  {' · '}
                  {s.duration.toFixed(0)}s
                  {words > 0 ? ` · ${words} words` : ' · no voice'}
                </span>
              </span>
              <span className="beat-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" title="Move up" onClick={() => move(i, -1)}><ChevronUp size={13} /></button>
                <button type="button" title="Move down" onClick={() => move(i, 1)}><ChevronDown size={13} /></button>
                <button type="button" title="Duplicate" onClick={() => duplicate(i)}><Copy size={13} /></button>
                <button type="button" title="Delete" onClick={() => remove(i)}><Trash2 size={13} /></button>
              </span>
            </button>
          );
        })}
      </div>

      {pickerOpen && (
        <div className="insert-modal" role="dialog">
          <div className="insert-panel">
            <div className="insert-head">
              <strong>Add a scene</strong>
              <button type="button" className="studio-btn" onClick={() => setPickerOpen(false)}><X size={14} /></button>
            </div>
            {groups.map((g) => (
              <div key={g.id} className="insert-group">
                <div className="insert-group-label">{g.label}</div>
                <div className="insert-grid">
                  {INSERT_CATALOG.filter((c) => c.group === g.id).map((c) => (
                    <button key={c.type} type="button" className="insert-card" onClick={() => insert(c.type)}>
                      <strong>{c.label}</strong>
                      <span>{c.useWhen}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Provenance sidecar for Studio.
//
// A lesson exported from here arrives in Studio as a finished file: placeable on
// a timeline, but never adjustable, because Studio never saw the DSL that
// produced it. Fixing a typo in one scene means coming back, re-exporting, and
// re-importing the whole clip.
//
// Exporting a small JSON file alongside the video fixes that. Studio looks for
// `<name>.studio.json` next to any media it imports; when it finds one the clip
// stays live and can be re-rendered from Studio with the same DSL.
//
// Deliberately a downloaded file rather than a POST to Studio: export here is
// entirely client-side and must keep working whether or not Studio is running,
// and this repo gains no dependency on it. Both files land in the same folder
// and Studio pairs them by name.

import { downloadBlob } from '@/lib/export';

/** The shape Studio reads. `input` is the document its CLI consumes, as a string. */
export interface StudioProvenance {
  generatorId: string;
  input: string;
  params?: Record<string, string>;
}

/**
 * exportName builds a filename unique to this export.
 *
 * The title slug alone repeats across exports of the same lesson, which the
 * browser resolves to "lesson (1).mp4" — fine for the video alone, but it makes
 * pairing a sidecar by name guesswork. A timestamp removes the ambiguity.
 */
export function exportName(title: string, suffix: string, ext: string): string {
  const safe = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'lesson';
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}` +
    `-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
  return `${safe}${suffix}-${stamp}.${ext}`;
}

/**
 * downloadProvenance saves the sidecar for a media file already downloaded as
 * `mediaName`. Studio derives the sidecar name by replacing the extension, so
 * the two must agree.
 */
export function downloadProvenance(mediaName: string, provenance: StudioProvenance) {
  const base = mediaName.replace(/\.[^.]+$/, '');
  const blob = new Blob([JSON.stringify(provenance, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${base}.studio.json`);
}

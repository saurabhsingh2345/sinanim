// Central font registration for every headless (@napi-rs/canvas) render script.
// Import this ONCE at the top of a render script — it registers the bundled
// variable TTFs under the exact family names the renderer asks for (see
// lib/render/shared.ts: MONO / SANS / DISPLAY). Keeping this in one place means
// a font swap touches a single file instead of all ~18 render scripts.
import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(here, '..', 'public', 'fonts');

function reg(file: string, family: string) {
  const p = join(FONT_DIR, file);
  if (existsSync(p)) {
    try { GlobalFonts.registerFromPath(p, family); return true; } catch {}
  }
  return false;
}

// Bundled, deterministic, cross-platform. Variable fonts: napi picks the weight
// axis from the canvas font string (e.g. "700 24px Inter").
const okMono = reg('JetBrainsMono.ttf', 'JetBrains Mono');
const okSans = reg('Inter.ttf', 'Inter');
const okDisplay = reg('SpaceGrotesk.ttf', 'Space Grotesk');
// Handwriting marker for the whiteboard template's written text.
const okHand = reg('Caveat.ttf', 'Caveat');

// Fallback for machines without the bundled files (keeps old scripts working).
if (!okMono) for (const p of ['/System/Library/Fonts/Menlo.ttc'])
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
if (!okSans) for (const p of ['/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf'])
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'Inter'); } catch {} }
if (!okDisplay) for (const p of ['/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial.ttf'])
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'Space Grotesk'); } catch {} }

export const FONTS_READY = { mono: okMono, sans: okSans, display: okDisplay, hand: okHand };

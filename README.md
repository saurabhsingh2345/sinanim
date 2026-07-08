# ◐ MOTION.dsl — prompt → narrated coding tutorial

Turn a natural-language prompt into a **finished, narrated, captioned tutorial
video**. No screen recording, no video editor, no manual syncing: a free LLM
writes the visuals *and* the voiceover script, a local open-source voice
(Kokoro TTS) speaks it in your browser, the timeline paces itself to the voice,
subtitles are burned in, and one click exports a publish-ready video file.

```
prompt ──▶ LLM writes DSL + narration script ──▶ Kokoro TTS speaks it (local, free)
       ──▶ timeline auto-paces to the voice ──▶ canvas renders frames + captions + sfx
       ──▶ export .mp4/.webm with the voice baked in
```

Re-recording a take becomes "edit one sentence and re-render".

## Stack (all open source / free)

| Concern        | Tool                                                        |
| -------------- | ----------------------------------------------------------- |
| App            | Next.js 14 (Pages Router) · React 18 · TypeScript           |
| LLM            | **Groq** (free) / OpenAI / **Ollama** (fully local)         |
| Voiceover      | **Kokoro TTS** (82M, Apache-2.0) via kokoro-js — runs 100% in-browser (WebGPU/WASM), no key |
| Syntax colors  | Shiki (drawn onto canvas, JS regex engine — no WASM)        |
| Rendering      | HTML5 Canvas 2D (deterministic `renderFrame(ctx, dsl, t)`)  |
| Sound          | Web Audio API — narration + keystroke / click samples       |
| Export         | `canvas.captureStream()` + `MediaRecorder` (video + audio)  |
| Styling        | Tailwind base + CSS variables · JetBrains Mono              |

## Quick start

```bash
npm install
# (optional) add a FREE Groq key for ~1s generations:
#   echo 'GROQ_API_KEY=gsk_...' >> .env.local     # https://console.groq.com/keys
npm run dev
```

Open the printed URL (e.g. http://localhost:3000). Type a topic → **Generate** →
the voice model (~90 MB) downloads once and is cached → **Preview** → **Export**.
The exported file already contains the narration, captions, and sound effects.

### LLM provider selection

The provider is auto-detected; force it with `LLM_PROVIDER` in `.env.local`.

1. `GROQ_API_KEY` set   → **Groq** (free, ~1s, Llama 3.3 70B) ← recommended
2. `OPENAI_API_KEY` set → **OpenAI** (paid)
3. neither              → **Ollama** (local, zero-key fallback: `ollama pull qwen3:8b`)

See `.env.example` for all options.

## The DSL

A video is an array of timed scenes; most scenes carry a `narration` string that
is synthesized to speech. **The timeline stretches automatically so the voice
always fits** — durations are minimums, not sync work. Example:

```json
{
  "title": "Python f-strings",
  "fps": 30, "width": 1920, "height": 1080, "backgroundColor": "#0d0d0f",
  "captions": true,
  "scenes": [
    { "type": "title", "text": "Python f-strings", "subtitle": "in 60 seconds",
      "narration": "Welcome! Let's learn f-strings.", "startTime": 0, "duration": 3 },
    { "type": "code", "language": "python", "code": "print(f'Hi {name}')",
      "narration": "We prefix the string with f and drop variables into braces.",
      "typingSpeed": 18, "title": "main.py", "startTime": 3, "duration": 4 },
    { "type": "click", "button": "Run", "startTime": 7.5, "duration": 0.5 },
    { "type": "terminal", "output": "Hi World", "narration": "And there's our output.",
      "typingSpeed": 40, "startTime": 8, "duration": 2 },
    { "type": "diff", "language": "python",
      "before": "print(f'Hi {name}')", "after": "print(f'Hi {name:>10}')",
      "narration": "Now let's right-align the name with a format spec.",
      "typingSpeed": 18, "startTime": 10, "duration": 5 }
  ]
}
```

Scene types: `title`, `code`, `diff`, `terminal`, `text`, `click`, `wait`,
`highlight`, `sprite`. `diff` evolves code on screen (kept lines stay, removed
lines collapse, added lines are typed) — the core tutorial pattern. `typingSpeed`
is **characters per second**. Edit the DSL live in the **dsl** tab and re-render.

### Narration & voices

- Voices are Kokoro voice ids (`af_heart`, `am_michael`, `bf_emma`, …) — pick one
  in the preview toolbar, or set `"voice"` in the DSL.
- Subtitles are generated from the narration text (`"captions": false` disables).
- Everything is synthesized locally in the browser; the first use downloads the
  model once (~90 MB, cached). WebGPU when available, WASM otherwise.
- Narration can be toggled off entirely in the toolbar.

## Project layout

```
lib/
  types.ts       DSL types
  dsl.ts         normalize + validate model output, repace, paceToNarration
  diff.ts        line diff (LCS) + diff animation phases
  llm.ts         Groq / OpenAI / Ollama backends + tutorial system prompt
  tts.ts         Kokoro TTS engine (browser: CDN ESM; node: npm package)
  narration.ts   synthesize scene narrations -> AudioBuffers + paced timeline
  highlight.ts   Shiki tokenizer -> colored tokens
  renderer.ts    renderFrame(ctx, dsl, t) — the deterministic core
  sounds.ts      Web Audio: narration playback + keystroke/click samples
  conductor.ts   fires narration + sfx from the timeline (preview + export)
  export.ts      MediaRecorder capture -> downloadable file
components/Stage.tsx      canvas player: voice bar / play / scrub / export
pages/                    index + API routes (generate-dsl, models, health)
scripts/render-test.mts   headless frame render (npm run render:test)
scripts/narration-test.mts  Kokoro smoke test in Node (npm run narration:test)
```

## Notes

- **Export format:** the recorder prefers MP4/H.264 when the browser supports it
  (Chrome/Safari) and falls back to WebM/VP9 (Firefox). The narration, captions,
  and sound effects are already in the file — upload it as-is.
- **Determinism:** the same `renderFrame` drives preview and export, so what you
  see is exactly what you get.
- **kokoro-js loading:** in the browser it is imported at runtime from jsDelivr
  (bundling onnxruntime-web breaks Next's minifier); Node scripts use the npm copy.

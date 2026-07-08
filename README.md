# ◐ MOTION.dsl — open-source code-animation engine

Turn a natural-language prompt into a clean, **exportable** code-tutorial video.
No screen recording, no manual syncing — a local/free LLM writes an animation
timeline (a small JSON **DSL**), a deterministic HTML5-canvas renderer plays it
back with synthesized sound, and you export a real video file in one click.

```
prompt ──▶ LLM writes DSL (JSON) ──▶ canvas renders frames + sound ──▶ export .mp4/.webm ──▶ add voiceover
```

## Stack (all open source)

| Concern        | Tool                                                        |
| -------------- | ----------------------------------------------------------- |
| App            | Next.js 14 (Pages Router) · React 18 · TypeScript           |
| LLM            | **Groq** (free) / OpenAI / **Ollama** (fully local)         |
| Syntax colors  | Shiki (drawn onto canvas, JS regex engine — no WASM)        |
| Rendering      | HTML5 Canvas 2D (deterministic `renderFrame(ctx, dsl, t)`)  |
| Sound          | Web Audio API — synthesized keystroke / click / beep        |
| Export         | `canvas.captureStream()` + `MediaRecorder` (video + audio)  |
| Styling        | Tailwind base + CSS variables · JetBrains Mono              |

## Quick start

```bash
npm install
# (optional) add a FREE Groq key for ~1s generations:
#   echo 'GROQ_API_KEY=gsk_...' >> .env.local     # https://console.groq.com/keys
npm run dev
```

Open the printed URL (e.g. http://localhost:3000). Type a prompt → **Generate** →
**Preview** → **Export**.

### LLM provider selection

The provider is auto-detected; force it with `LLM_PROVIDER` in `.env.local`.

1. `GROQ_API_KEY` set   → **Groq** (free, ~1s, Llama 3.3 70B) ← recommended
2. `OPENAI_API_KEY` set → **OpenAI** (paid)
3. neither              → **Ollama** (local, zero-key fallback: `ollama pull qwen3:8b`)

See `.env.example` for all options.

## The DSL

A video is an array of timed scenes. Example:

```json
{
  "title": "Python Hello World",
  "fps": 30, "width": 1920, "height": 1080, "backgroundColor": "#0d0d0f",
  "scenes": [
    { "type": "code", "language": "python", "code": "print('Hello')",
      "typingSpeed": 18, "title": "main.py", "startTime": 0, "duration": 4 },
    { "type": "click", "button": "Run", "startTime": 4.5, "duration": 0.5 },
    { "type": "terminal", "output": "Hello", "typingSpeed": 40, "startTime": 5, "duration": 2 },
    { "type": "text", "content": "prints to stdout", "position": "bottom", "startTime": 5, "duration": 2 }
  ]
}
```

Scene types: `code`, `terminal`, `text`, `click`, `wait`, `highlight`. `typingSpeed`
is **characters per second**. Edit the DSL live in the **dsl** tab and re-render.

## Project layout

```
lib/
  types.ts       DSL types
  dsl.ts         normalize + validate model output, JSON extraction
  llm.ts         Groq / OpenAI / Ollama backends
  highlight.ts   Shiki tokenizer -> colored tokens
  renderer.ts    renderFrame(ctx, dsl, t) — the deterministic core
  sounds.ts      Web Audio synthesis (+ capture stream for export)
  conductor.ts   fires sounds from the timeline (shared by preview + export)
  export.ts      MediaRecorder capture -> downloadable file
components/Stage.tsx      canvas player: play / scrub / mute / export
pages/                    index + API routes (generate-dsl, models, health)
scripts/render-test.mts   headless frame render (npm run render:test)
```

## Notes

- **Export format:** the recorder prefers MP4/H.264 when the browser supports it
  (Chrome/Safari) and falls back to WebM/VP9 (Firefox). Both import into DaVinci
  Resolve / CapCut for voiceover.
- **Determinism:** the same `renderFrame` drives preview and export, so what you
  see is exactly what you get.

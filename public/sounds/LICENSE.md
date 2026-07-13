# Sound assets

All `.wav` files in this directory are **procedurally synthesized** by
`scripts/generate-sounds.mts` — pure DSP (sines, filtered noise, envelopes) with
a fixed seed. They contain **no third-party samples** and are the project's own
work, released **CC0 / public domain**. No attribution required.

Regenerate anytime with:

```bash
npx tsx scripts/generate-sounds.mts
```

| File | Role |
|---|---|
| key-1..5, space, enter, back | keyboard voices (typing, spacebar, return, backspace) |
| click | UI button click |
| whoosh, swish | scene / morph transitions |
| pop, tick | reveal ticks, count-up ticks |
| chime, buzz | quiz correct / incorrect |
| hover | cursor-over-target hint |
| send, ting | API request / response landed |
| success | challenge passed fanfare |
| bed | soft looping ambient music bed (ducks under narration) |

// Record REAL command output for terminal scenes — colors, spinners and all.
//
// Runs each command, captures stdout+stderr chunks with timestamps, and emits:
//   1. an asciicast v2 file (plays in asciinema-compatible players), and
//   2. a ready-to-paste `cli` scene JSON whose "output" keeps the raw ANSI —
//      the canvas terminal (lib/ansi.ts) renders those colors for real.
//
//   npx tsx scripts/record-terminal.mts "npm --version" "ls --color=forced"
//   npx tsx scripts/record-terminal.mts --out session "git log --oneline -3"
//
// Commands run through your shell with FORCE_COLOR / CLICOLOR_FORCE set, so
// most tools keep their colors even though stdout is a pipe. Review what you
// record — output lands verbatim in the lesson.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

interface Rec {
  command: string;
  output: string;
  /** [seconds-from-start, chunk] pairs (asciicast events). */
  events: [number, string][];
  seconds: number;
}

function runOne(command: string): Promise<Rec> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const events: [number, string][] = [];
    let output = '';
    const child = spawn(command, {
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: '3',
        CLICOLOR_FORCE: '1',
        TERM: 'xterm-256color',
        COLUMNS: '100',
      },
    });
    const onChunk = (buf: Buffer) => {
      const text = buf.toString('utf8');
      output += text;
      events.push([(Date.now() - t0) / 1000, text]);
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('close', () => resolve({ command, output, events, seconds: (Date.now() - t0) / 1000 }));
    // recording a hung command helps nobody
    setTimeout(() => { try { child.kill(); } catch {} }, 30_000);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const stem = outIdx >= 0 ? args[outIdx + 1] : 'terminal-session';
  const commands = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
  if (!commands.length) {
    console.error('usage: npx tsx scripts/record-terminal.mts [--out name] "cmd 1" "cmd 2" …');
    process.exit(1);
  }

  const recs: Rec[] = [];
  for (const command of commands) {
    process.stdout.write(`$ ${command}\n`);
    recs.push(await runOne(command));
  }

  // asciicast v2: header line + one event per chunk, offset per command
  const lines: string[] = [
    JSON.stringify({ version: 2, width: 100, height: 30, timestamp: Math.floor(Date.now() / 1000) }),
  ];
  let offset = 0;
  for (const r of recs) {
    lines.push(JSON.stringify([offset, 'o', `$ ${r.command}\r\n`]));
    for (const [t, chunk] of r.events) {
      lines.push(JSON.stringify([offset + 0.4 + t, 'o', chunk.replace(/\n/g, '\r\n')]));
    }
    offset += 0.6 + r.seconds;
  }
  const castPath = `${stem}.cast`;
  writeFileSync(castPath, lines.join('\n') + '\n');

  // cli scene: raw ANSI output preserved; weight from real runtime
  const scene = {
    type: 'cli',
    title: `zsh — recorded`,
    cwd: '~',
    commands: recs.map((r) => ({
      command: r.command,
      output: r.output.replace(/\r\n/g, '\n').replace(/\n+$/, '').slice(0, 4000),
      weight: Math.min(5, Math.max(0.4, r.seconds)),
    })),
    narration: 'TODO: narrate what these commands do and why.',
    startTime: 0,
    duration: Math.max(4, Math.round(offset + 2)),
  };
  const scenePath = `${stem}.scene.json`;
  writeFileSync(scenePath, JSON.stringify(scene, null, 2));

  console.log(`\nwrote ${castPath} (asciicast v2) and ${scenePath} (paste into your DSL "scenes")`);
}

main().catch((e) => { console.error(e); process.exit(1); });

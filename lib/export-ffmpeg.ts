import type { RecordResult } from './export';

/**
 * Node-only FFmpeg remux (WebM → MP4). Do not import from client components.
 * Use from scripts / API routes only.
 */
export async function finalizeWithFFmpegNode(
  blob: Blob,
  ext: string,
): Promise<RecordResult> {
  try {
    const { spawn } = await import('child_process');
    const { writeFile, readFile, unlink } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const inPath = join(tmpdir(), `newani-in-${Date.now()}.${ext}`);
    const outPath = join(tmpdir(), `newani-out-${Date.now()}.mp4`);
    await writeFile(inPath, Buffer.from(await blob.arrayBuffer()));
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        'ffmpeg',
        ['-y', '-i', inPath, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', outPath],
        { stdio: 'ignore' },
      );
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    });
    const buf = await readFile(outPath);
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
    return { blob: new Blob([buf], { type: 'video/mp4' }), ext: 'mp4' };
  } catch {
    return { blob, ext };
  }
}

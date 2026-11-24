import { spawn as nodeSpawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';

export interface ChildProcessLike {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: 'close', cb: (code: number | null) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
}
export type Spawn = (cmd: string, args: string[]) => ChildProcessLike;

export interface RecorderHandle {
  readonly done: Promise<{ code: number; stderrTail: string }>;
  stop(): void;
  bytesWritten(): Promise<number>;
}

const realSpawn: Spawn = (cmd, args) => nodeSpawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] }) as unknown as ChildProcessLike;

/** Original quality: `best` = highest resolution/fps the platform offers (4K when the streamer sends 4K). */
export function buildStreamlinkArgs(liveUrl: string): string[] {
  return [liveUrl, 'best', '--stdout', '--retry-streams', '5', '--retry-max', '3', '--stream-segment-threads', '3', '--loglevel', 'warning'];
}

/** Stream copy only — no re-encode, no scaling. 10-minute MPEG-TS segments. */
export function buildFfmpegArgs(outDir: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-map', '0',
    '-c', 'copy',
    '-f', 'segment', '-segment_time', '600', '-segment_format', 'mpegts', '-reset_timestamps', '1',
    `${outDir}/part_%05d.ts`,
  ];
}

const TAIL = 4000;

export function startRecorder(liveUrl: string, outDir: string, spawn: Spawn = realSpawn): RecorderHandle {
  fs.mkdirSync(outDir, { recursive: true });
  let tail = '';
  const addTail = (d: Buffer | string) => {
    tail = (tail + d.toString()).slice(-TAIL);
  };

  const sl = spawn('streamlink', buildStreamlinkArgs(liveUrl));
  const ff = spawn('ffmpeg', buildFfmpegArgs(outDir));
  sl.stdout.pipe(ff.stdin);
  sl.stderr.on('data', addTail);
  ff.stderr.on('data', addTail);
  ff.stdin.on('error', () => {}); // EPIPE when ffmpeg dies first

  let slExited = false;
  sl.on('close', () => {
    slExited = true;
    ff.stdin.end();
  });
  sl.on('error', (e) => {
    slExited = true;
    addTail(`streamlink: ${e.message}\n`);
    ff.stdin.end();
  });

  const done = new Promise<{ code: number; stderrTail: string }>((resolve) => {
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (!slExited) sl.kill('SIGINT');
      resolve({ code, stderrTail: tail });
    };
    ff.on('close', (code) => finish(code ?? -1));
    ff.on('error', (e) => {
      addTail(`ffmpeg: ${e.message}\n`);
      finish(-1);
    });
  });

  return {
    done,
    stop() {
      if (!slExited) sl.kill('SIGINT');
    },
    async bytesWritten() {
      const files = await fs.promises.readdir(outDir).catch(() => [] as string[]);
      let total = 0;
      for (const f of files) {
        if (!f.endsWith('.ts')) continue;
        total += (await fs.promises.stat(path.join(outDir, f))).size;
      }
      return total;
    },
  };
}

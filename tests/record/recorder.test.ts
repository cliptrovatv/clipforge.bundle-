import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStreamlinkArgs, buildFfmpegArgs, startRecorder, type Spawn, type ChildProcessLike } from '@/src/record/recorder';

function fakeChild(): ChildProcessLike & { signals: string[]; exit(code: number): void } {
  const ee = new EventEmitter() as EventEmitter & ChildProcessLike & { signals: string[]; exit(code: number): void };
  ee.stdin = new PassThrough();
  ee.stdout = new PassThrough();
  ee.stderr = new PassThrough();
  ee.signals = [];
  ee.kill = (sig?: NodeJS.Signals | number) => {
    ee.signals.push(String(sig));
    return true;
  };
  ee.exit = (code) => ee.emit('close', code);
  return ee;
}

describe('recorder args', () => {
  it('streamlink asks for best quality to stdout', () => {
    const a = buildStreamlinkArgs('https://www.twitch.tv/xqc');
    expect(a[0]).toBe('https://www.twitch.tv/xqc');
    expect(a[1]).toBe('best');
    expect(a).toContain('--stdout');
    for (const q of ['worst', '720p', '480p', '360p', '160p', 'audio_only']) expect(a).not.toContain(q);
  });
  it('ffmpeg copies streams into 600s mpegts segments, never re-encodes', () => {
    const a = buildFfmpegArgs('/out');
    const i = a.indexOf('-c');
    expect(a[i + 1]).toBe('copy');
    expect(a).toContain('600');
    expect(a).toContain('mpegts');
    expect(a[a.length - 1]).toBe('/out/part_%05d.ts');
    for (const f of ['-vf', '-s', '-b:v', '-crf', '-preset']) expect(a).not.toContain(f);
  });
});

describe('startRecorder', () => {
  it('pipes streamlink into ffmpeg and resolves with ffmpeg exit', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cf-')), 'rec');
    const kids: Record<string, ReturnType<typeof fakeChild>> = {};
    const spawn: Spawn = (cmd) => (kids[cmd] = fakeChild());
    const h = startRecorder('https://kick.com/a', dir, spawn);
    expect(fs.existsSync(dir)).toBe(true);
    let got = '';
    kids.ffmpeg.stdin.on('data', (d) => (got += d));
    kids.streamlink.stdout.write('VIDEO');
    await new Promise((r) => setImmediate(r));
    expect(got).toBe('VIDEO');
    h.stop();
    expect(kids.streamlink.signals).toContain('SIGINT');
    kids.streamlink.exit(0);
    kids.ffmpeg.stderr.write('some error\n');
    kids.ffmpeg.exit(3);
    const res = await h.done;
    expect(res.code).toBe(3);
    expect(res.stderrTail).toContain('some error');
  });

  it('bytesWritten sums segment sizes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
    fs.writeFileSync(path.join(dir, 'part_00000.ts'), Buffer.alloc(10));
    fs.writeFileSync(path.join(dir, 'part_00001.ts'), Buffer.alloc(20));
    fs.writeFileSync(path.join(dir, 'notes.txt'), Buffer.alloc(99));
    const h = startRecorder('u', dir, () => fakeChild());
    expect(await h.bytesWritten()).toBe(30);
  });
});

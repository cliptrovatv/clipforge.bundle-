import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor, type SupervisorDeps } from '@/src/worker/supervisor';
import { LiveCheckError, type LiveStatus } from '@/src/live/check';
import type { RecorderHandle } from '@/src/record/recorder';
import { fakeRepo } from '../helpers/fakeRepo';
import { loadConfig } from '@/src/config';

type FakeRec = RecorderHandle & { url: string; dir: string; end(code: number): void; stopped: boolean };

function setup(opts: { cap?: number } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-sup-'));
  const repo = fakeRepo();
  const live = new Map<string, LiveStatus | 'error'>();
  const recorders: FakeRec[] = [];
  const checked: string[] = [];
  let free = 100;
  let now = new Date('2026-11-24T12:00:00Z');
  let bytes = 42;
  let failStartFor: string | null = null;
  let stopResolves = true;
  const deps: SupervisorDeps = {
    repo,
    checkLive: async (url) => {
      checked.push(url);
      const s = live.get(url);
      if (s === 'error') throw new LiveCheckError('429');
      return s ?? { live: false, title: null, displayName: null };
    },
    startRecorder: (url, dir) => {
      if (url === failStartFor) throw new Error('EACCES: permission denied');
      let resolve!: (v: { code: number; stderrTail: string }) => void;
      const done = new Promise<{ code: number; stderrTail: string }>((r) => (resolve = r));
      const rec: FakeRec = {
        url, dir, done, stopped: false,
        stop() { rec.stopped = true; if (stopResolves) resolve({ code: 0, stderrTail: '' }); },
        bytesWritten: async () => bytes,
        end(code) { resolve({ code, stderrTail: 'boom' }); },
      };
      recorders.push(rec);
      return rec;
    },
    freeDiskGb: async () => free,
    now: () => now,
    config: loadConfig({
      DATABASE_URL: 'x', APP_PASSWORD: 'p', SESSION_SECRET: 's', DATA_DIR: dataDir,
      MAX_CONCURRENT_RECORDINGS: String(opts.cap ?? 8),
    }),
  };
  const on = (url: string) => live.set(url, { live: true, title: 'T', displayName: 'Name' });
  const off = (url: string) => live.set(url, { live: false, title: null, displayName: null });
  return {
    sup: new Supervisor(deps), repo, live, on, off, recorders, checked, dataDir,
    setFree: (n: number) => (free = n),
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
    setBytes: (n: number) => (bytes = n),
    failStart: (url: string | null) => (failStartFor = url),
    stuckStops: () => (stopResolves = false),
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Supervisor', () => {
  it('respects the concurrency cap and starts waiting channels when a slot frees', async () => {
    const t = setup({ cap: 2 });
    const [a, b, c] = ['kick.com/a', 'kick.com/b', 'kick.com/c'].map((l) => t.repo.add(l));
    [a, b, c].forEach((ch) => t.on(ch.liveUrl));
    await t.sup.tick();
    expect(t.recorders).toHaveLength(2);
    expect(t.sup.status()[c.id]).toBe('waiting');
    t.recorders[0].end(0);
    t.off(a.liveUrl);
    await flush();
    await t.sup.tick();
    expect(t.recorders).toHaveLength(3);
    expect(t.recorders[2].url).toBe(c.liveUrl);
    expect(t.sup.status()[c.id]).toBe('recording');
    expect(t.repo.recs[0].status).toBe('done');
  });

  it('resumes as a new part when a recorder dies while still live', async () => {
    const t = setup();
    const a = t.repo.add('twitch.tv/a');
    t.on(a.liveUrl);
    await t.sup.tick();
    t.recorders[0].end(1);
    await flush();
    expect(t.repo.recs[0].status).toBe('failed');
    expect(t.repo.recs[0].error).toContain('boom');
    expect(t.repo.recs[0].bytes).toBe(42);
    await t.sup.tick();
    expect(t.recorders).toHaveLength(2);
    expect(t.repo.recs[1].status).toBe('recording');
  });

  it('does not start new recordings when disk is low but keeps running ones', async () => {
    const t = setup();
    const a = t.repo.add('twitch.tv/a');
    const b = t.repo.add('twitch.tv/b');
    t.on(a.liveUrl);
    await t.sup.tick();
    t.setFree(5);
    t.on(b.liveUrl);
    await t.sup.tick();
    expect(t.recorders).toHaveLength(1);
    expect(t.recorders[0].stopped).toBe(false);
    expect(t.sup.diskLow()).toBe(true);
    expect(t.sup.status()[b.id]).toBe('waiting');
    const status = JSON.parse(fs.readFileSync(path.join(t.dataDir, 'status.json'), 'utf8'));
    expect(status.diskLow).toBe(true);
    expect(status.channels[a.id]).toBe('recording');
  });

  it('recover marks stale recording rows interrupted, then re-records live channels', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    await t.repo.startRecording(a.id, '/old', null);
    t.on(a.liveUrl);
    await t.sup.recover();
    expect(t.repo.recs[0].status).toBe('interrupted');
    await t.sup.tick();
    expect(t.recorders).toHaveLength(1);
  });

  it('never double-starts a channel that is already recording', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    t.on(a.liveUrl);
    await t.sup.tick();
    await t.sup.tick();
    expect(t.recorders).toHaveLength(1);
    expect(t.checked).toHaveLength(1);
  });

  it('never checks disabled channels, and stops a recording when its channel is disabled', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    const b = t.repo.add('kick.com/b');
    t.on(a.liveUrl);
    t.on(b.liveUrl);
    await t.repo.setChannelEnabled(b.id, false);
    await t.sup.tick();
    await t.repo.setChannelEnabled(a.id, false);
    await t.sup.tick();
    expect(t.checked).not.toContain(b.liveUrl);
    expect(t.recorders[0].stopped).toBe(true);
    await flush();
    expect(t.repo.recs[0].status).toBe('done');
  });

  it('marks check errors as error state and retries next tick', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    t.live.set(a.liveUrl, 'error');
    await t.sup.tick();
    expect(t.sup.status()[a.id]).toBe('error');
    t.on(a.liveUrl);
    await t.sup.tick();
    expect(t.sup.status()[a.id]).toBe('recording');
  });

  it('records into a per-channel folder and saves the display name', async () => {
    const t = setup();
    const a = t.repo.add('https://www.twitch.tv/xqc');
    t.on(a.liveUrl);
    await t.sup.tick();
    expect(t.recorders[0].dir).toBe(path.join(t.dataDir, 'recordings', 'twitch-xqc', '2026-11-24T12-00-00Z'));
    expect(t.repo.channels[0].displayName).toBe('Name');
    expect(t.repo.recs[0].title).toBe('T');
  });

  it('stopAll stops every recorder and closes rows as done', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    t.on(a.liveUrl);
    await t.sup.tick();
    await t.sup.stopAll();
    expect(t.recorders[0].stopped).toBe(true);
    expect(t.repo.recs[0].status).toBe('done');
  });

  it('a recorder that never stops does not freeze the loop', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    const b = t.repo.add('kick.com/b');
    t.on(a.liveUrl);
    await t.sup.tick();
    t.stuckStops();
    await t.repo.setChannelEnabled(a.id, false);
    t.on(b.liveUrl);
    await t.sup.tick();
    expect(t.recorders[0].stopped).toBe(true);
    expect(t.recorders.map((r) => r.url)).toContain(b.liveUrl);
  });

  it('backs off a live channel whose recordings keep failing instantly with no footage', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    t.on(a.liveUrl);
    t.setBytes(0);
    await t.sup.tick();
    t.recorders[0].end(1);
    await flush();
    t.advance(60_000);
    await t.sup.tick();
    expect(t.recorders).toHaveLength(1);
    expect(t.sup.status()[a.id]).toBe('error');
    t.advance(2 * 60_000);
    await t.sup.tick();
    expect(t.recorders).toHaveLength(2);
    t.recorders[1].end(1);
    await flush();
    t.advance(3 * 60_000);
    await t.sup.tick();
    expect(t.recorders).toHaveLength(2); // backoff doubled to 4 min
    t.advance(2 * 60_000);
    await t.sup.tick();
    expect(t.recorders).toHaveLength(3);
    t.setBytes(5_000_000);
    t.recorders[2].end(1);
    await flush();
    t.advance(60_000);
    await t.sup.tick();
    expect(t.recorders).toHaveLength(4); // real footage resets the backoff
  });

  it('a recorder that fails to start marks its row failed and other channels still start', async () => {
    const t = setup();
    const a = t.repo.add('kick.com/a');
    const b = t.repo.add('kick.com/b');
    t.on(a.liveUrl);
    t.on(b.liveUrl);
    t.failStart(a.liveUrl);
    await t.sup.tick();
    expect(t.repo.recs.find((r) => r.channelId === a.id)!.status).toBe('failed');
    expect(t.repo.recs.find((r) => r.channelId === a.id)!.error).toContain('EACCES');
    expect(t.sup.status()[a.id]).toBe('error');
    expect(t.sup.status()[b.id]).toBe('recording');
  });
});

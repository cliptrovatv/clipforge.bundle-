import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkLive, LiveCheckError } from '@/src/live/check';
import type { Run } from '@/src/proc/runner';

const fx = (f: string) => fs.readFileSync(path.join(__dirname, '../fixtures', f), 'utf8');
const fake = (code: number, stdout = '', stderr = ''): Run & { calls: string[][] } => {
  const calls: string[][] = [];
  const run = (async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args]);
    return { code, stdout, stderr };
  }) as Run & { calls: string[][] };
  run.calls = calls;
  return run;
};

describe('checkLive', () => {
  it('parses a live stream', async () => {
    const run = fake(0, fx('ytdlp-live.json'));
    expect(await checkLive('https://www.twitch.tv/xqc', run)).toEqual({ live: true, title: 'JUICERS RISE', displayName: 'xQc' });
    expect(run.calls[0][0]).toBe('yt-dlp');
    expect(run.calls[0]).toContain('--dump-single-json');
    expect(run.calls[0]).toContain('https://www.twitch.tv/xqc');
  });

  it('treats upcoming as not live', async () => {
    const run = fake(0, JSON.stringify({ title: 'soon', live_status: 'is_upcoming', is_live: false }));
    expect((await checkLive('u', run)).live).toBe(false);
  });

  it('treats a finished VOD on /live as not live', async () => {
    const run = fake(0, JSON.stringify({ title: 'old', live_status: 'was_live', is_live: false }));
    expect((await checkLive('u', run)).live).toBe(false);
  });

  it.each([
    fx('ytdlp-notlive.txt'),
    'ERROR: [youtube] abc: This live event will begin in 3 hours.',
    'ERROR: [youtube:tab] @x: The channel is not currently live',
    'ERROR: [kick:live] y: Offline',
    'ERROR: [youtube] @x/live: Premieres in 2 days',
  ])('offline stderr → not live: %s', async (stderr) => {
    expect(await checkLive('u', fake(1, '', stderr))).toEqual({ live: false, title: null, displayName: null });
  });

  it('other errors throw LiveCheckError', async () => {
    await expect(checkLive('u', fake(1, '', 'ERROR: HTTP Error 429: Too Many Requests'))).rejects.toBeInstanceOf(LiveCheckError);
  });
});

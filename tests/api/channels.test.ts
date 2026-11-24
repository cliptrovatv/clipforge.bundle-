import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { postChannel, getChannels, getRecordings, resolveDataPath } from '@/src/server/handlers';
import { fakeRepo } from '../helpers/fakeRepo';

describe('channel handlers', () => {
  it('adds a channel and dedupes another spelling of it', async () => {
    const repo = fakeRepo();
    const a = await postChannel(repo, { input: 'twitch.tv/xqc' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ created: true, channel: { key: 'twitch:xqc' } });
    const b = await postChannel(repo, { input: 'https://www.twitch.tv/XQC' });
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ created: false });
    expect(repo.channels).toHaveLength(1);
  });
  it('400s on a bare name with help text', async () => {
    const r = await postChannel(fakeRepo(), { input: 'xqc' });
    expect(r.status).toBe(400);
    expect(String((r.body as { error: string }).error)).toMatch(/channel link/);
  });
  it('400s on a missing body', async () => {
    expect((await postChannel(fakeRepo(), null)).status).toBe(400);
  });
  it('lists channels with state from status.json', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-api-'));
    const repo = fakeRepo();
    const a = repo.add('kick.com/a');
    const b = repo.add('kick.com/b');
    fs.writeFileSync(path.join(dataDir, 'status.json'), JSON.stringify({ diskLow: true, freeDiskGb: 3, updatedAt: new Date().toISOString(), channels: { [a.id]: 'recording' } }));
    const r = await getChannels(repo, dataDir);
    expect(r.body.diskLow).toBe(true);
    expect(r.body.channels.find((c) => c.id === a.id)!.state).toBe('recording');
    expect(r.body.channels.find((c) => c.id === b.id)!.state).toBe('offline');
  });
  it('lists channels as offline when there is no status file', async () => {
    const repo = fakeRepo();
    repo.add('kick.com/a');
    const r = await getChannels(repo, '/nonexistent-dir');
    expect(r.body.channels[0].state).toBe('offline');
    expect(r.body.workerOnline).toBe(false);
  });
});

describe('recordings handler', () => {
  it('lists parts with download paths relative to the recordings dir', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-api-'));
    const dir = path.join(dataDir, 'recordings', 'kick-a', '2026-11-24T12-00-00Z');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'part_00001.ts'), 'bb');
    fs.writeFileSync(path.join(dir, 'part_00000.ts'), 'a');
    const repo = fakeRepo();
    const ch = repo.add('kick.com/a');
    await repo.startRecording(ch.id, dir, 'T');
    const r = await getRecordings(repo, dataDir);
    expect(r.body.recordings[0].parts).toEqual([
      { name: 'part_00000.ts', size: 1, path: 'kick-a/2026-11-24T12-00-00Z/part_00000.ts' },
      { name: 'part_00001.ts', size: 2, path: 'kick-a/2026-11-24T12-00-00Z/part_00001.ts' },
    ]);
  });
});

describe('resolveDataPath', () => {
  it('resolves files inside recordings', () => {
    expect(resolveDataPath('/data', ['kick-a', 'x', 'part_00000.ts'])).toBe('/data/recordings/kick-a/x/part_00000.ts');
  });
  it.each([[['..', '..', 'etc', 'passwd']], [['kick-a', '..', '..', 'status.json']], [['/etc/passwd']], [[]]])('rejects %j', (parts) => {
    expect(resolveDataPath('/data', parts)).toBeNull();
  });
});

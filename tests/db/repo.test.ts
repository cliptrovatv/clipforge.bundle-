import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb } from '../helpers/db';
import { createRepo, type Repo } from '@/src/db/repo';
import { resolveChannel } from '@/src/channels/resolve';
import type pg from 'pg';

let repo: Repo;
let pool: pg.Pool;
beforeEach(async () => {
  const t = await testDb();
  pool = t.pool;
  repo = createRepo(t.db);
});
afterEach(async () => pool.end());

describe('repo', () => {
  it('dedupes channels by key', async () => {
    const a = await repo.addChannel(resolveChannel('twitch.tv/xqc'));
    const b = await repo.addChannel(resolveChannel('https://www.twitch.tv/XQC'));
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.channel.id).toBe(a.channel.id);
    expect(await repo.listChannels()).toHaveLength(1);
  });

  it('starts and finishes recordings', async () => {
    const { channel } = await repo.addChannel(resolveChannel('kick.com/a'));
    const r = await repo.startRecording(channel.id, '/data/x', 'Title');
    expect(await repo.activeRecordings()).toHaveLength(1);
    await repo.finishRecording(r.id, 'done', 123);
    expect(await repo.activeRecordings()).toHaveLength(0);
    const [row] = await repo.listRecordings();
    expect(row.bytes).toBe(123);
    expect(row.endedAt).toBeInstanceOf(Date);
    expect(row.channel.handle).toBe('a');
  });

  it('cascades channel delete', async () => {
    const { channel } = await repo.addChannel(resolveChannel('kick.com/a'));
    await repo.startRecording(channel.id, '/d', null);
    await repo.deleteChannel(channel.id);
    expect(await repo.listRecordings()).toHaveLength(0);
  });

  it('setChannelEnabled toggles', async () => {
    const { channel } = await repo.addChannel(resolveChannel('kick.com/a'));
    await repo.setChannelEnabled(channel.id, false);
    expect((await repo.listChannels())[0].enabled).toBe(false);
  });

  it('recordingsOlderThan returns only ended rows before cutoff', async () => {
    const { channel } = await repo.addChannel(resolveChannel('kick.com/a'));
    const old = await repo.startRecording(channel.id, '/old', null);
    await repo.finishRecording(old.id, 'done', 1);
    await pool.query("UPDATE recordings SET ended_at = now() - interval '8 days' WHERE id = $1", [old.id]);
    const recent = await repo.startRecording(channel.id, '/recent', null);
    await repo.finishRecording(recent.id, 'done', 1);
    const active = await repo.startRecording(channel.id, '/active', null);
    await pool.query("UPDATE recordings SET started_at = now() - interval '10 days' WHERE id = $1", [active.id]);
    const res = await repo.recordingsOlderThan(new Date(Date.now() - 7 * 86400e3));
    expect(res.map((r) => r.dir)).toEqual(['/old']);
    await repo.deleteRecording(old.id);
    expect(await repo.listRecordings()).toHaveLength(2);
  });
});

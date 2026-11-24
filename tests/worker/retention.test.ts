import { describe, it, expect } from 'vitest';
import { cleanupOldRecordings } from '@/src/worker/retention';
import { fakeRepo } from '../helpers/fakeRepo';

describe('cleanupOldRecordings', () => {
  it('deletes only ended recordings past retention', async () => {
    const repo = fakeRepo();
    const ch = repo.add('kick.com/a');
    const now = new Date('2026-11-24T00:00:00Z');
    const day = 86400e3;
    const old = await repo.startRecording(ch.id, '/data/old', null);
    await repo.finishRecording(old.id, 'done', 1);
    repo.recs[0].endedAt = new Date(now.getTime() - 8 * day);
    const recent = await repo.startRecording(ch.id, '/data/recent', null);
    await repo.finishRecording(recent.id, 'done', 1);
    repo.recs[1].endedAt = new Date(now.getTime() - 2 * day);
    await repo.startRecording(ch.id, '/data/active', null);
    repo.recs[2].startedAt = new Date(now.getTime() - 10 * day);

    const removed: string[] = [];
    const n = await cleanupOldRecordings(repo, now, 7, async (d) => {
      removed.push(d);
    });
    expect(n).toBe(1);
    expect(removed).toEqual(['/data/old']);
    expect(repo.recs.map((r) => r.dir)).toEqual(['/data/recent', '/data/active']);
  });
});

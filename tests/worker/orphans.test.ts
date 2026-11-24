import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupOrphanDirs } from '@/src/worker/retention';
import { fakeRepo } from '../helpers/fakeRepo';

describe('cleanupOrphanDirs', () => {
  it('deletes recording folders with no database row once they are an hour old', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-orph-'));
    const mk = (rel: string, ageMs: number) => {
      const d = path.join(root, rel);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'part_00000.ts'), 'x');
      const t = new Date(Date.now() - ageMs);
      fs.utimesSync(d, t, t);
      return d;
    };
    const kept = mk('kick-a/2026-11-20T00-00-00Z', 5 * 3600e3);
    const orphanOld = mk('kick-deleted/2026-11-20T00-00-00Z', 5 * 3600e3);
    const orphanFresh = mk('kick-deleted2/2026-11-24T00-00-00Z', 60e3);
    const repo = fakeRepo();
    const ch = repo.add('kick.com/a');
    await repo.startRecording(ch.id, kept, null);

    const n = await cleanupOrphanDirs(repo, root, new Date());
    expect(n).toBe(1);
    expect(fs.existsSync(kept)).toBe(true);
    expect(fs.existsSync(orphanOld)).toBe(false);
    expect(fs.existsSync(path.join(root, 'kick-deleted'))).toBe(false); // empty channel folder removed too
    expect(fs.existsSync(orphanFresh)).toBe(true);
  });

  it('is a no-op when the recordings folder does not exist', async () => {
    expect(await cleanupOrphanDirs(fakeRepo(), '/nonexistent/recordings', new Date())).toBe(0);
  });
});

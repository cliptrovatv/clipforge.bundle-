import fs from 'node:fs';
import type { Repo } from '../db/repo';

const rmDir = (dir: string) => fs.promises.rm(dir, { recursive: true, force: true });

export async function cleanupOldRecordings(
  repo: Repo,
  now: Date,
  retentionDays: number,
  rm: (dir: string) => Promise<void> = rmDir,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86400e3);
  const old = await repo.recordingsOlderThan(cutoff);
  for (const r of old) {
    await rm(r.dir);
    await repo.deleteRecording(r.id);
  }
  return old.length;
}

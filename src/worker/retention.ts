import fs from 'node:fs';
import path from 'node:path';
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

/**
 * Deletes recording folders that no recording row points at (e.g. the channel was deleted),
 * once they've been untouched for `graceMs`. Also removes channel folders left empty.
 */
export async function cleanupOrphanDirs(repo: Repo, recordingsRoot: string, now: Date, graceMs = 3600e3): Promise<number> {
  const channelDirs = await fs.promises.readdir(recordingsRoot, { withFileTypes: true }).catch(() => []);
  if (!channelDirs.length) return 0;
  const known = new Set((await repo.allRecordingDirs()).map((d) => path.resolve(d)));
  let removed = 0;
  for (const ch of channelDirs) {
    if (!ch.isDirectory()) continue;
    const chPath = path.join(recordingsRoot, ch.name);
    const recs = await fs.promises.readdir(chPath, { withFileTypes: true }).catch(() => []);
    let left = 0;
    for (const r of recs) {
      const p = path.resolve(chPath, r.name);
      if (!r.isDirectory() || known.has(p)) {
        left++;
        continue;
      }
      const st = await fs.promises.stat(p);
      if (now.getTime() - st.mtimeMs < graceMs) {
        left++;
        continue;
      }
      await rmDir(p);
      removed++;
    }
    if (left === 0) await fs.promises.rmdir(chPath).catch(() => {});
  }
  return removed;
}

import fs from 'node:fs';

export async function freeDiskGb(p: string): Promise<number> {
  await fs.promises.mkdir(p, { recursive: true });
  const s = await fs.promises.statfs(p);
  return (s.bavail * s.bsize) / 1e9;
}

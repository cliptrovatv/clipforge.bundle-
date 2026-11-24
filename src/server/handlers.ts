import fs from 'node:fs';
import path from 'node:path';
import type { Repo, Channel, Recording } from '../db/repo';
import { resolveChannel, ChannelInputError } from '../channels/resolve';
import type { ChannelState, StatusFile } from '../worker/supervisor';

export interface Res<T> {
  status: number;
  body: T;
}

export async function postChannel(repo: Repo, body: unknown): Promise<Res<{ channel: Channel; created: boolean } | { error: string }>> {
  const input = (body as { input?: unknown } | null)?.input;
  if (typeof input !== 'string') return { status: 400, body: { error: 'Paste a channel link.' } };
  try {
    const result = await repo.addChannel(resolveChannel(input));
    return { status: result.created ? 201 : 200, body: result };
  } catch (e) {
    if (e instanceof ChannelInputError) return { status: 400, body: { error: e.message } };
    throw e;
  }
}

export function readStatus(dataDir: string): StatusFile | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, 'status.json'), 'utf8')) as StatusFile;
  } catch {
    return null;
  }
}

const WORKER_STALE_MS = 5 * 60e3;

export async function getChannels(repo: Repo, dataDir: string) {
  const status = readStatus(dataDir);
  const channels = (await repo.listChannels()).map((c) => ({
    ...c,
    state: (status?.channels[c.id] ?? 'offline') as ChannelState,
  }));
  const workerOnline = !!status && Date.now() - new Date(status.updatedAt).getTime() < WORKER_STALE_MS;
  return {
    status: 200,
    body: { channels, diskLow: status?.diskLow ?? false, freeDiskGb: status?.freeDiskGb ?? null, workerOnline },
  };
}

export interface Part {
  name: string;
  size: number;
  path: string;
}

function listParts(dataDir: string, r: Recording): Part[] {
  const root = path.join(dataDir, 'recordings');
  let files: string[];
  try {
    files = fs.readdirSync(r.dir).filter((f) => f.endsWith('.ts')).sort();
  } catch {
    return [];
  }
  return files.map((name) => {
    const abs = path.join(r.dir, name);
    return { name, size: fs.statSync(abs).size, path: path.relative(root, abs).split(path.sep).join('/') };
  });
}

export async function getRecordings(repo: Repo, dataDir: string) {
  const rows = await repo.listRecordings(200);
  return {
    status: 200,
    body: {
      recordings: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        bytes: r.bytes,
        error: r.error,
        channel: { id: r.channel.id, platform: r.channel.platform, handle: r.channel.handle, displayName: r.channel.displayName },
        parts: listParts(dataDir, r),
      })),
    },
  };
}

/** Maps URL path segments to a file under `${dataDir}/recordings`, or null if it would escape it. */
export function resolveDataPath(dataDir: string, parts: string[]): string | null {
  if (!parts.length || parts.some((p) => !p || p === '.' || p === '..' || p.includes('/') || p.includes('\\') || p.includes('\0'))) return null;
  const root = path.resolve(dataDir, 'recordings');
  const abs = path.resolve(root, ...parts);
  return abs.startsWith(root + path.sep) ? abs : null;
}

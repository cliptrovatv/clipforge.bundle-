import fs from 'node:fs';
import path from 'node:path';
import type { Repo, Channel } from '../db/repo';
import type { checkLive as CheckLive, LiveStatus } from '../live/check';
import type { startRecorder as StartRecorder, RecorderHandle } from '../record/recorder';
import type { Config } from '../config';

export type ChannelState = 'offline' | 'recording' | 'waiting' | 'error';

export interface SupervisorDeps {
  repo: Repo;
  checkLive: typeof CheckLive;
  startRecorder: typeof StartRecorder;
  freeDiskGb: () => Promise<number>;
  now: () => Date;
  config: Config;
}

export interface StatusFile {
  updatedAt: string;
  diskLow: boolean;
  freeDiskGb: number;
  channels: Record<number, ChannelState>;
}

interface Active {
  recordingId: number;
  handle: RecorderHandle;
  stopping: boolean;
  finished: Promise<void>;
}

const CHECK_PARALLELISM = 4;
/** A recording that ends within this time with no footage counts as a failed start. */
const FAILED_START_MS = 120_000;
const BACKOFF_MIN_MS = 2 * 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export class Supervisor {
  private active = new Map<number, Active>();
  private states: Record<number, ChannelState> = {};
  private finishing = new Set<Promise<void>>();
  private low = false;
  private free = 0;
  private backoff = new Map<number, { until: number; delayMs: number }>();

  constructor(private deps: SupervisorDeps) {}

  status(): Record<number, ChannelState> {
    return { ...this.states };
  }

  diskLow(): boolean {
    return this.low;
  }

  async recover(): Promise<void> {
    for (const r of await this.deps.repo.activeRecordings()) {
      await this.deps.repo.finishRecording(r.id, 'interrupted', await dirBytes(r.dir), 'worker restarted');
    }
  }

  async tick(): Promise<void> {
    const { repo, config } = this.deps;

    this.free = await this.deps.freeDiskGb();
    this.low = this.free < config.minFreeDiskGb;

    const all = await repo.listChannels();
    const byId = new Map(all.map((c) => [c.id, c]));

    // Stop recordings whose channel was deleted or disabled. They finish in the background
    // (the recorder force-kills after a deadline), so one stuck process can't freeze the loop.
    for (const [id, a] of this.active) {
      const ch = byId.get(id);
      if ((!ch || !ch.enabled) && !a.stopping) {
        a.stopping = true;
        a.handle.stop();
      }
    }
    const nowMs = this.deps.now().getTime();

    const states: Record<number, ChannelState> = {};
    for (const c of all) states[c.id] = this.active.has(c.id) ? 'recording' : 'offline';

    const toCheck = all.filter((c) => {
      if (!c.enabled || this.active.has(c.id)) return false;
      const b = this.backoff.get(c.id);
      if (b && nowMs < b.until) {
        states[c.id] = 'error';
        return false;
      }
      return true;
    });
    const results = await mapLimit(toCheck, CHECK_PARALLELISM, async (c) => {
      try {
        return { c, s: await this.deps.checkLive(c.liveUrl) as LiveStatus | null };
      } catch (e) {
        console.error(`[check] ${c.key}: ${(e as Error).message}`);
        return { c, s: null };
      }
    });

    for (const { c, s } of results) {
      if (!s) {
        states[c.id] = 'error';
        continue;
      }
      if (!s.live) continue;
      if (this.low || this.active.size >= config.maxConcurrentRecordings) {
        states[c.id] = 'waiting';
        continue;
      }
      if (s.displayName && s.displayName !== c.displayName) await repo.setChannelDisplayName(c.id, s.displayName);
      try {
        await this.start(c, s.title);
        states[c.id] = 'recording';
      } catch (e) {
        console.error(`[rec] could not start ${c.key}: ${(e as Error).message}`);
        states[c.id] = 'error';
      }
    }

    this.states = states;
    await this.writeStatus();
  }

  async stopAll(): Promise<void> {
    for (const a of this.active.values()) {
      a.stopping = true;
      a.handle.stop();
    }
    await Promise.all(this.finishing);
    for (const id of Object.keys(this.states)) this.states[Number(id)] = 'offline';
    await this.writeStatus();
  }

  private async start(c: Channel, title: string | null) {
    const stamp = this.deps.now().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
    const dir = path.join(this.deps.config.dataDir, 'recordings', `${c.platform}-${c.handle}`, stamp);
    const rec = await this.deps.repo.startRecording(c.id, dir, title);
    const startedMs = this.deps.now().getTime();
    let handle: RecorderHandle;
    try {
      handle = this.deps.startRecorder(c.liveUrl, dir);
    } catch (e) {
      await this.deps.repo.finishRecording(rec.id, 'failed', 0, (e as Error).message);
      this.noteFailedStart(c.id);
      throw e;
    }
    const a: Active = { recordingId: rec.id, handle, stopping: false, finished: Promise.resolve() };
    this.active.set(c.id, a);
    console.log(`[rec] start ${c.key} → ${dir}`);

    const p: Promise<void> = handle.done
      .then(async ({ code, stderrTail }) => {
        const bytes = await handle.bytesWritten();
        const ok = a.stopping || code === 0;
        await this.deps.repo.finishRecording(rec.id, ok ? 'done' : 'failed', bytes, ok ? undefined : stderrTail.slice(-1000));
        if (bytes > 0) this.backoff.delete(c.id);
        else if (!a.stopping && this.deps.now().getTime() - startedMs < FAILED_START_MS) this.noteFailedStart(c.id);
        console.log(`[rec] end ${c.key} code=${code} bytes=${bytes}`);
      })
      .catch((e) => console.error(`[rec] finish ${c.key}: ${(e as Error).message}`))
      .finally(() => {
        this.active.delete(c.id);
        this.finishing.delete(p);
      });
    a.finished = p;
    this.finishing.add(p);
  }

  /** Live but unrecordable (sub-only, geo-blocked, plugin broken): wait 2, 4, 8… up to 30 min before retrying. */
  private noteFailedStart(channelId: number) {
    const prev = this.backoff.get(channelId);
    const delayMs = prev ? Math.min(prev.delayMs * 2, BACKOFF_MAX_MS) : BACKOFF_MIN_MS;
    this.backoff.set(channelId, { until: this.deps.now().getTime() + delayMs, delayMs });
  }

  private async writeStatus() {
    const file: StatusFile = {
      updatedAt: this.deps.now().toISOString(),
      diskLow: this.low,
      freeDiskGb: Math.round(this.free * 10) / 10,
      channels: this.states,
    };
    await fs.promises.mkdir(this.deps.config.dataDir, { recursive: true });
    const tmp = path.join(this.deps.config.dataDir, 'status.json.tmp');
    await fs.promises.writeFile(tmp, JSON.stringify(file));
    await fs.promises.rename(tmp, path.join(this.deps.config.dataDir, 'status.json'));
  }
}

async function dirBytes(dir: string): Promise<number> {
  const files = await fs.promises.readdir(dir).catch(() => [] as string[]);
  let total = 0;
  for (const f of files) total += (await fs.promises.stat(path.join(dir, f)).catch(() => ({ size: 0 }))).size;
  return total;
}

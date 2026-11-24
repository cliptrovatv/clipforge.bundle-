import { and, desc, eq, isNotNull, lt } from 'drizzle-orm';
import type { Db } from './client';
import { channels, recordings, type Channel, type Recording } from './schema';
import type { ResolvedChannel } from '../channels/resolve';

export type { Channel, Recording };
export type FinishStatus = 'done' | 'failed' | 'interrupted';

export interface Repo {
  addChannel(c: ResolvedChannel): Promise<{ channel: Channel; created: boolean }>;
  listChannels(): Promise<Channel[]>;
  setChannelEnabled(id: number, enabled: boolean): Promise<void>;
  setChannelDisplayName(id: number, name: string): Promise<void>;
  deleteChannel(id: number): Promise<void>;
  startRecording(channelId: number, dir: string, title: string | null): Promise<Recording>;
  finishRecording(id: number, status: FinishStatus, bytes: number, error?: string): Promise<void>;
  activeRecordings(): Promise<Recording[]>;
  listRecordings(limit?: number): Promise<(Recording & { channel: Channel })[]>;
  getRecording(id: number): Promise<(Recording & { channel: Channel }) | null>;
  recordingsOlderThan(cutoff: Date): Promise<Recording[]>;
  deleteRecording(id: number): Promise<void>;
}

export function createRepo(db: Db): Repo {
  return {
    async addChannel(c) {
      const inserted = await db
        .insert(channels)
        .values({ platform: c.platform, handle: c.handle, key: c.key, liveUrl: c.liveUrl })
        .onConflictDoNothing({ target: channels.key })
        .returning();
      if (inserted.length) return { channel: inserted[0], created: true };
      const [existing] = await db.select().from(channels).where(eq(channels.key, c.key));
      return { channel: existing, created: false };
    },
    listChannels: () => db.select().from(channels).orderBy(channels.createdAt),
    async setChannelEnabled(id, enabled) {
      await db.update(channels).set({ enabled }).where(eq(channels.id, id));
    },
    async setChannelDisplayName(id, name) {
      await db.update(channels).set({ displayName: name }).where(eq(channels.id, id));
    },
    async deleteChannel(id) {
      await db.delete(channels).where(eq(channels.id, id));
    },
    async startRecording(channelId, dir, title) {
      const [r] = await db.insert(recordings).values({ channelId, dir, title, status: 'recording' }).returning();
      return r;
    },
    async finishRecording(id, status, bytes, error) {
      await db
        .update(recordings)
        .set({ status, bytes, error: error ?? null, endedAt: new Date() })
        .where(eq(recordings.id, id));
    },
    activeRecordings: () => db.select().from(recordings).where(eq(recordings.status, 'recording')),
    async listRecordings(limit = 200) {
      const rows = await db
        .select()
        .from(recordings)
        .innerJoin(channels, eq(recordings.channelId, channels.id))
        .orderBy(desc(recordings.startedAt), desc(recordings.id))
        .limit(limit);
      return rows.map((r) => ({ ...r.recordings, channel: r.channels }));
    },
    async getRecording(id) {
      const [r] = await db
        .select()
        .from(recordings)
        .innerJoin(channels, eq(recordings.channelId, channels.id))
        .where(eq(recordings.id, id));
      return r ? { ...r.recordings, channel: r.channels } : null;
    },
    recordingsOlderThan: (cutoff) =>
      db
        .select()
        .from(recordings)
        .where(and(isNotNull(recordings.endedAt), lt(recordings.endedAt, cutoff))),
    async deleteRecording(id) {
      await db.delete(recordings).where(eq(recordings.id, id));
    },
  };
}

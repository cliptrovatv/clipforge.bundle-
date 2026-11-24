import type { Repo, Channel, Recording } from '@/src/db/repo';
import { resolveChannel } from '@/src/channels/resolve';

export function fakeRepo(): Repo & { channels: Channel[]; recs: Recording[]; add(link: string): Channel } {
  const channels: Channel[] = [];
  const recs: Recording[] = [];
  let cid = 0;
  let rid = 0;
  const withCh = (r: Recording) => ({ ...r, channel: channels.find((c) => c.id === r.channelId)! });
  const repo = {
    channels,
    recs,
    add(link: string) {
      const c = resolveChannel(link);
      const ch: Channel = { id: ++cid, ...c, displayName: null, enabled: true, createdAt: new Date() };
      channels.push(ch);
      return ch;
    },
    async addChannel(c) {
      const ex = channels.find((x) => x.key === c.key);
      if (ex) return { channel: ex, created: false };
      return { channel: repo.add(c.liveUrl), created: true };
    },
    listChannels: async () => [...channels],
    async setChannelEnabled(id, enabled) {
      channels.find((c) => c.id === id)!.enabled = enabled;
    },
    async setChannelDisplayName(id, name) {
      channels.find((c) => c.id === id)!.displayName = name;
    },
    async deleteChannel(id) {
      channels.splice(channels.findIndex((c) => c.id === id), 1);
    },
    async startRecording(channelId, dir, title) {
      const r: Recording = { id: ++rid, channelId, dir, title, status: 'recording', bytes: 0, startedAt: new Date(), endedAt: null, error: null };
      recs.push(r);
      return r;
    },
    async finishRecording(id, status, bytes, error) {
      Object.assign(recs.find((r) => r.id === id)!, { status, bytes, error: error ?? null, endedAt: new Date() });
    },
    activeRecordings: async () => recs.filter((r) => r.status === 'recording'),
    listRecordings: async () => recs.map(withCh).reverse(),
    getRecording: async (id) => {
      const r = recs.find((x) => x.id === id);
      return r ? withCh(r) : null;
    },
    recordingsOlderThan: async (cutoff) => recs.filter((r) => r.endedAt && r.endedAt < cutoff),
    async deleteRecording(id) {
      recs.splice(recs.findIndex((r) => r.id === id), 1);
    },
  } satisfies Repo & { channels: Channel[]; recs: Recording[]; add(link: string): Channel };
  return repo;
}

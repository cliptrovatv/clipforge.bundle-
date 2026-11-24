'use client';
import { useCallback, useEffect, useState } from 'react';
import { Tabs } from '../components/Tabs';

type State = 'offline' | 'recording' | 'waiting' | 'error';
interface Ch { id: number; platform: 'youtube' | 'twitch' | 'kick'; handle: string; displayName: string | null; liveUrl: string; enabled: boolean; state: State }
interface Data { channels: Ch[]; diskLow: boolean; freeDiskGb: number | null; workerOnline: boolean }

const STATE_LABEL: Record<State, string> = { recording: 'REC', waiting: 'waiting', offline: 'offline', error: 'check failed' };

export default function Streamers() {
  const [data, setData] = useState<Data | null>(null);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/channels', { cache: 'no-store' });
    if (res.status === 401) location.href = '/login';
    else if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ text: body.error ?? 'Could not add channel', error: true });
    setMsg({ text: body.created ? `Watching ${body.channel.handle}. Recording starts automatically when they go live.` : `${body.channel.handle} is already on your list.`, error: false });
    setInput('');
    load();
  }

  async function toggle(c: Ch) {
    await fetch(`/api/channels/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: !c.enabled }) });
    load();
  }

  async function remove(c: Ch) {
    if (!confirm(`Stop watching ${c.displayName ?? c.handle}? Its recordings will be deleted from the list.`)) return;
    await fetch(`/api/channels/${c.id}`, { method: 'DELETE' });
    load();
  }

  const live = data?.channels.filter((c) => c.state === 'recording').length ?? 0;

  return (
    <>
      <main className="stack">
        <h1>Streamers</h1>
        <form onSubmit={add} className="stack">
          <input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="Paste a YouTube, Twitch or Kick channel link" value={input} onChange={(e) => setInput(e.target.value)} />
          <button disabled={busy || !input.trim()}>{busy ? 'Adding…' : 'Add channel'}</button>
          {msg && <div className={msg.error ? 'error-text' : 'muted small'}>{msg.text}</div>}
        </form>

        {data && !data.workerOnline && <div className="banner">Recorder is offline: live checks and recording are paused.</div>}
        {data?.diskLow && <div className="banner">Disk almost full ({data.freeDiskGb} GB left): new recordings won&apos;t start until space frees up.</div>}

        {data && (
          <div className="muted small">
            {data.channels.length} channels · {live} recording now
          </div>
        )}

        {data?.channels.length === 0 && <div className="card muted">No channels yet. Paste a streamer&apos;s channel link above.</div>}

        {data?.channels.map((c) => (
          <div key={c.id} className="card row">
            <span className={`badge ${c.platform}`}>{c.platform}</span>
            <div className="grow">
              <div className="ellipsis" style={{ fontWeight: 600 }}>{c.displayName ?? c.handle}</div>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <span className={`pill ${c.enabled ? c.state : 'offline'}`}>
                  {c.enabled && c.state === 'recording' && <span className="dot" />}
                  {c.enabled ? STATE_LABEL[c.state] : 'paused'}
                </span>
                <a className="muted small ellipsis grow" href={c.liveUrl} target="_blank" rel="noreferrer">
                  {c.liveUrl.replace(/^https:\/\/(www\.)?/, '')}
                </a>
              </div>
            </div>
            <label className="switch" title={c.enabled ? 'Watching' : 'Paused'}>
              <input type="checkbox" checked={c.enabled} onChange={() => toggle(c)} aria-label={`Watch ${c.handle}`} />
              <span />
            </label>
            <button className="ghost" onClick={() => remove(c)} aria-label={`Remove ${c.handle}`}>✕</button>
          </div>
        ))}
      </main>
      <Tabs />
    </>
  );
}

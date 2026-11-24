'use client';
import { useCallback, useEffect, useState } from 'react';
import { Tabs } from '../components/Tabs';
import { formatBytes, formatDuration } from '../components/format';

interface Part { name: string; size: number; path: string }
interface Rec {
  id: number; title: string | null; status: 'recording' | 'done' | 'failed' | 'interrupted';
  startedAt: string; endedAt: string | null; bytes: number; error: string | null;
  channel: { platform: string; handle: string; displayName: string | null }; parts: Part[];
}

const LABEL = { recording: 'REC', done: 'saved', failed: 'cut short', interrupted: 'interrupted' };

export default function Recordings() {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/recordings', { cache: 'no-store' });
    if (res.status === 401) location.href = '/login';
    else if (res.ok) setRecs((await res.json()).recordings);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <main className="stack">
        <h1>Recordings</h1>
        <div className="muted small">Saved at the stream&apos;s original quality. Full recordings are kept 7 days.</div>
        {recs?.length === 0 && <div className="card muted">Nothing recorded yet. Recordings appear here as soon as a watched channel goes live.</div>}
        {recs?.map((r) => {
          const size = r.parts.reduce((s, p) => s + p.size, 0) || r.bytes;
          const dur = (r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - new Date(r.startedAt).getTime();
          return (
            <div key={r.id} className="card">
              <button className="row" onClick={() => setOpen(open === r.id ? null : r.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, width: '100%', alignItems: 'center' }}>
                <span className={`badge ${r.channel.platform}`}>{r.channel.platform}</span>
                <div className="grow">
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{r.channel.displayName ?? r.channel.handle}</div>
                  <div className="muted small ellipsis">{r.title ?? 'Untitled stream'}</div>
                  <div className="muted small">
                    {new Date(r.startedAt).toLocaleString()} · {formatDuration(dur)} · {formatBytes(size)} · {r.parts.length} parts
                  </div>
                </div>
                <span className={`pill ${r.status}`}>
                  {r.status === 'recording' && <span className="dot" />}
                  {LABEL[r.status]}
                </span>
              </button>
              {open === r.id && (
                <div className="parts">
                  {r.error && <div className="muted small">{r.error.split('\n').filter(Boolean).pop()}</div>}
                  {r.parts.length === 0 && <div className="muted small">No video saved for this recording.</div>}
                  {r.parts.map((p, i) => (
                    <a key={p.path} href={`/api/files/${p.path.split('/').map(encodeURIComponent).join('/')}`}>
                      <span>Part {i + 1} · {i * 10}–{(i + 1) * 10} min</span>
                      <span className="muted">{formatBytes(p.size)} ↓</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </main>
      <Tabs />
    </>
  );
}

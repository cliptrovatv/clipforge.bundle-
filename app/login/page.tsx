'use client';
import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.ok) location.href = '/streamers';
    else setError((await res.json().catch(() => ({}))).error ?? 'Sign-in failed');
  }

  return (
    <main style={{ maxWidth: 380, paddingTop: '18vh' }}>
      <h1>ClipForge</h1>
      <form onSubmit={submit} className="stack">
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <button disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {error && <div className="error-text">{error}</div>}
      </form>
    </main>
  );
}

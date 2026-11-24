import { describe, it, expect } from 'vitest';
import { signSession, verifySession, checkPassword, LoginLimiter } from '@/src/auth/session';

describe('session', () => {
  it('verifies a fresh token', async () => {
    expect(await verifySession(await signSession('sec'), 'sec')).toBe(true);
  });
  it('rejects tampered, wrong-secret and expired tokens', async () => {
    const t = await signSession('sec');
    const [exp, sig] = t.split('.');
    expect(await verifySession(`${Number(exp) + 1000}.${sig}`, 'sec')).toBe(false);
    expect(await verifySession(t, 'other')).toBe(false);
    expect(await verifySession(await signSession('sec', Date.now() - 31 * 86400e3), 'sec')).toBe(false);
    expect(await verifySession('', 'sec')).toBe(false);
    expect(await verifySession(undefined, 'sec')).toBe(false);
    expect(await verifySession(t, '')).toBe(false);
  });
  it('checks the password', () => {
    expect(checkPassword('hunter2', 'hunter2')).toBe(true);
    expect(checkPassword('hunter', 'hunter2')).toBe(false);
  });
  it('locks out after 5 failures in 15 minutes', () => {
    const l = new LoginLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) l.fail('ip', t0);
    expect(l.blocked('ip', t0 + 1000)).toBe(true);
    expect(l.blocked('other', t0)).toBe(false);
    expect(l.blocked('ip', t0 + 16 * 60e3)).toBe(false);
  });
});

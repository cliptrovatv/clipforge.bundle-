import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/login/route';

const req = (password: string, headers: Record<string, string> = {}) =>
  new NextRequest('http://x/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers },
  });

afterEach(() => {
  process.env.APP_PASSWORD = 'pw';
  process.env.SESSION_SECRET = 'a-long-enough-session-secret';
});

describe('login route', () => {
  it('refuses all logins when APP_PASSWORD is not set', async () => {
    process.env.APP_PASSWORD = '';
    process.env.SESSION_SECRET = 'a-long-enough-session-secret';
    const res = await POST(req(''));
    expect(res.status).toBe(500);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
  it('refuses all logins when SESSION_SECRET is not set', async () => {
    process.env.APP_PASSWORD = 'pw';
    process.env.SESSION_SECRET = '';
    expect((await POST(req('pw'))).status).toBe(500);
  });
  it('sets a Secure cookie behind an HTTPS proxy', async () => {
    process.env.APP_PASSWORD = 'pw';
    process.env.SESSION_SECRET = 'a-long-enough-session-secret';
    const res = await POST(req('pw', { 'x-forwarded-proto': 'https' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/Secure/i);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
  });
});

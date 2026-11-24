import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { signSession, SESSION_COOKIE } from '@/src/auth/session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'sec';
});

describe('middleware', () => {
  it('redirects signed-out pages to /login', async () => {
    const res = await middleware(new NextRequest('http://x/streamers'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://x/login');
  });
  it('401s signed-out API calls', async () => {
    expect((await middleware(new NextRequest('http://x/api/channels'))).status).toBe(401);
  });
  it('lets /login through', async () => {
    expect((await middleware(new NextRequest('http://x/login'))).headers.get('x-middleware-next')).toBe('1');
  });
  it('lets signed-in requests through', async () => {
    const req = new NextRequest('http://x/api/channels', { headers: { cookie: `${SESSION_COOKIE}=${await signSession('sec')}` } });
    expect((await middleware(req)).headers.get('x-middleware-next')).toBe('1');
  });
});

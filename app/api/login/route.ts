import { NextResponse, type NextRequest } from 'next/server';
import { checkPassword, signSession, LoginLimiter, SESSION_COOKIE } from '@/src/auth/session';

const limiter = new LoginLimiter();

export async function POST(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD ?? '';
  const secret = process.env.SESSION_SECRET ?? '';
  if (!appPassword || !secret) {
    return NextResponse.json({ error: 'Server not configured: set APP_PASSWORD and SESSION_SECRET in .env' }, { status: 500 });
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (limiter.blocked(ip)) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== 'string' || !checkPassword(password, appPassword)) {
    limiter.fail(ip);
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  limiter.reset(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.headers.get('x-forwarded-proto') === 'https' || req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 30 * 86400,
  });
  return res;
}

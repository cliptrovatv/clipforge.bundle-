import { NextResponse, type NextRequest } from 'next/server';
import { checkPassword, signSession, LoginLimiter, SESSION_COOKIE } from '@/src/auth/session';

const limiter = new LoginLimiter();

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (limiter.blocked(ip)) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== 'string' || !checkPassword(password, process.env.APP_PASSWORD ?? '')) {
    limiter.fail(ip);
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  limiter.reset(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(process.env.SESSION_SECRET ?? ''), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 30 * 86400,
  });
  return res;
}

// Web Crypto only, so this runs in both Node and the Next.js edge middleware.
const MAX_AGE_MS = 30 * 86400e3;
export const SESSION_COOKIE = 'cf_session';

const enc = new TextEncoder();

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** `now` lets tests mint tokens in the past. */
export async function signSession(secret: string, now = Date.now()): Promise<string> {
  const exp = String(now + MAX_AGE_MS);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifySession(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < now) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

export function checkPassword(given: string, expected: string): boolean {
  return safeEqual(given, expected);
}

/** 5 failed logins per IP within 15 minutes → blocked until the window passes. */
export class LoginLimiter {
  private fails = new Map<string, number[]>();
  constructor(private max = 5, private windowMs = 15 * 60e3) {}
  private recent(ip: string, now: number) {
    const list = (this.fails.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    this.fails.set(ip, list);
    return list;
  }
  fail(ip: string, now = Date.now()) {
    this.recent(ip, now).push(now);
  }
  blocked(ip: string, now = Date.now()): boolean {
    return this.recent(ip, now).length >= this.max;
  }
  reset(ip: string) {
    this.fails.delete(ip);
  }
}

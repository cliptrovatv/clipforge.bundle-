import { z } from 'zod';

export interface Config {
  databaseUrl: string;
  dataDir: string;
  maxConcurrentRecordings: number;
  checkIntervalSeconds: number;
  retentionDays: number;
  minFreeDiskGb: number;
  appPassword: string;
  sessionSecret: string;
}

type Env = Record<string, string | undefined>;

const REQUIRED = ['DATABASE_URL', 'APP_PASSWORD', 'SESSION_SECRET'] as const;

const positiveNumber = (name: string, fallback: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === '') return fallback;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: 'custom', message: `Invalid number in env: ${name}=${v}` });
        return z.NEVER;
      }
      return n;
    });

export function loadConfig(env: Env = process.env): Config {
  for (const name of REQUIRED) {
    if (!env[name]) throw new Error(`Missing env: ${name}`);
  }
  const schema = z.object({
    MAX_CONCURRENT_RECORDINGS: positiveNumber('MAX_CONCURRENT_RECORDINGS', 8),
    CHECK_INTERVAL_SECONDS: positiveNumber('CHECK_INTERVAL_SECONDS', 60),
    RETENTION_DAYS: positiveNumber('RETENTION_DAYS', 7),
    MIN_FREE_DISK_GB: positiveNumber('MIN_FREE_DISK_GB', 20),
  });
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
  const n = parsed.data;
  return {
    databaseUrl: env.DATABASE_URL!,
    appPassword: env.APP_PASSWORD!,
    sessionSecret: env.SESSION_SECRET!,
    dataDir: env.DATA_DIR || '/data',
    maxConcurrentRecordings: n.MAX_CONCURRENT_RECORDINGS,
    checkIntervalSeconds: n.CHECK_INTERVAL_SECONDS,
    retentionDays: n.RETENTION_DAYS,
    minFreeDiskGb: n.MIN_FREE_DISK_GB,
  };
}

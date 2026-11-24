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

const REQUIRED = ['DATABASE_URL', 'APP_PASSWORD', 'SESSION_SECRET'] as const;
const posInt = (def: number) => z.coerce.number().int().positive().default(def);

const schema = z.object({
  DATABASE_URL: z.string(),
  APP_PASSWORD: z.string(),
  SESSION_SECRET: z.string(),
  DATA_DIR: z.string().default('/data'),
  MAX_CONCURRENT_RECORDINGS: posInt(8),
  CHECK_INTERVAL_SECONDS: posInt(60),
  RETENTION_DAYS: posInt(7),
  MIN_FREE_DISK_GB: z.coerce.number().nonnegative().default(20),
});

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing env: ${key}`);
  }
  const e = schema.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    dataDir: e.DATA_DIR,
    maxConcurrentRecordings: e.MAX_CONCURRENT_RECORDINGS,
    checkIntervalSeconds: e.CHECK_INTERVAL_SECONDS,
    retentionDays: e.RETENTION_DAYS,
    minFreeDiskGb: e.MIN_FREE_DISK_GB,
    appPassword: e.APP_PASSWORD,
    sessionSecret: e.SESSION_SECRET,
  };
}

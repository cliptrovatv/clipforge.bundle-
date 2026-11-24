import { loadConfig } from '../config';
import { createDb } from '../db/client';
import { migrate } from '../db/migrate';
import { createRepo } from '../db/repo';
import { checkLive } from '../live/check';
import { startRecorder } from '../record/recorder';
import { Supervisor } from './supervisor';
import { cleanupOldRecordings } from './retention';
import { freeDiskGb } from './disk';

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.databaseUrl);
  await migrate(pool);
  const repo = createRepo(db);

  const sup = new Supervisor({
    repo,
    checkLive,
    startRecorder,
    freeDiskGb: () => freeDiskGb(config.dataDir),
    now: () => new Date(),
    config,
  });
  await sup.recover();
  console.log(`[worker] up — checking every ${config.checkIntervalSeconds}s, max ${config.maxConcurrentRecordings} recordings`);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sup.tick();
    } catch (e) {
      console.error('[worker] tick failed', e);
    } finally {
      running = false;
    }
  };
  const cleanup = async () => {
    try {
      const n = await cleanupOldRecordings(repo, new Date(), config.retentionDays);
      if (n) console.log(`[worker] removed ${n} recordings older than ${config.retentionDays} days`);
    } catch (e) {
      console.error('[worker] cleanup failed', e);
    }
  };

  await tick();
  await cleanup();
  const t1 = setInterval(tick, config.checkIntervalSeconds * 1000);
  const t2 = setInterval(cleanup, 3600 * 1000);

  const shutdown = async (sig: string) => {
    console.log(`[worker] ${sig} — stopping recordings`);
    clearInterval(t1);
    clearInterval(t2);
    await sup.stopAll();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

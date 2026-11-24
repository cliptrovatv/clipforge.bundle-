import { loadConfig, type Config } from '../config';
import { createDb } from '../db/client';
import { createRepo, type Repo } from '../db/repo';
import { migrate } from '../db/migrate';

let ctx: Promise<{ config: Config; repo: Repo }> | null = null;

/** One DB pool per server process; tables created on first use. */
export function getContext() {
  ctx ??= (async () => {
    const config = loadConfig();
    const { db, pool } = createDb(config.databaseUrl);
    await migrate(pool);
    return { config, repo: createRepo(db) };
  })().catch((e) => {
    ctx = null;
    throw e;
  });
  return ctx;
}

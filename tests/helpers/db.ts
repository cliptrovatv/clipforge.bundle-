import { createDb } from '@/src/db/client';
import { migrate } from '@/src/db/migrate';

export async function testDb() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/clipforge_test';
  const { db, pool } = createDb(url);
  await migrate(pool);
  await pool.query('TRUNCATE recordings, channels RESTART IDENTITY CASCADE');
  return { db, pool };
}

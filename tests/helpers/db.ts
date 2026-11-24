import fs from 'node:fs';
import path from 'node:path';
import { createDb } from '@/src/db/client';

export async function testDb() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/clipforge_test';
  const { db, pool } = createDb(url);
  await pool.query(fs.readFileSync(path.resolve(__dirname, '../../src/db/migrate.sql'), 'utf8'));
  await pool.query('TRUNCATE recordings, channels RESTART IDENTITY CASCADE');
  return { db, pool };
}

import { pgTable, serial, text, boolean, timestamp, integer, bigint } from 'drizzle-orm/pg-core';

export const channels = pgTable('channels', {
  id: serial('id').primaryKey(),
  platform: text('platform').$type<'youtube' | 'twitch' | 'kick'>().notNull(),
  handle: text('handle').notNull(),
  key: text('key').notNull().unique(),
  liveUrl: text('live_url').notNull(),
  displayName: text('display_name'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RecordingStatus = 'recording' | 'done' | 'failed' | 'interrupted';

export const recordings = pgTable('recordings', {
  id: serial('id').primaryKey(),
  channelId: integer('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  title: text('title'),
  status: text('status').$type<RecordingStatus>().notNull(),
  dir: text('dir').notNull(),
  bytes: bigint('bytes', { mode: 'number' }).notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  error: text('error'),
});

export type Channel = typeof channels.$inferSelect;
export type Recording = typeof recordings.$inferSelect;

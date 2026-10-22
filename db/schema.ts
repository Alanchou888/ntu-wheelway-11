import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const communityReports = sqliteTable('community_reports', {
  id: text('id').primaryKey(), segmentId: text('segment_id').notNull(), category: text('category').notNull(), impact: text('impact').notNull(),
  message: text('message').notNull(), authorName: text('author_name').notNull(), authorKey: text('author_key').notNull(),
  observedAt: text('observed_at').notNull(), createdAt: text('created_at').notNull(), photoKey: text('photo_key'),
  status: text('status').notNull().default('visible'),
  longitude: real('longitude'), latitude: real('latitude'),
}, table => [index('reports_segment_created').on(table.segmentId, table.createdAt), index('reports_author_created').on(table.authorKey, table.createdAt)])

export const communityVotes = sqliteTable('community_votes', {
  reportId: text('report_id').notNull().references(() => communityReports.id), actorKey: text('actor_key').notNull(),
  reaction: text('reaction').notNull(), note: text('note').notNull().default(''), name: text('name').notNull(), createdAt: text('created_at').notNull(),
}, table => [primaryKey({ columns: [table.reportId, table.actorKey] })])

export const communityFlags = sqliteTable('community_flags', {
  reportId: text('report_id').notNull().references(() => communityReports.id), actorKey: text('actor_key').notNull(),
  reason: text('reason').notNull(), createdAt: text('created_at').notNull(),
}, table => [primaryKey({ columns: [table.reportId, table.actorKey] })])

export const communityRate = sqliteTable('community_rate', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expiresAt: text('expires_at').notNull(),
})

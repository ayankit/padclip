import { index, integer, sqliteTable, text, blob } from 'drizzle-orm/sqlite-core';

export const pads = sqliteTable(
	'pads',
	{
		id: text().notNull().primaryKey(),
		content: text().notNull(),
		contentBytes: integer('content_bytes').notNull(),
		version: integer().notNull(),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(table) => [index('pads_updated_at_idx').on(table.updatedAt)]
);

export const padAuth = sqliteTable('pad_auth', {
	padId: text('pad_id')
		.notNull()
		.primaryKey()
		.references(() => pads.id, { onDelete: 'cascade' }),
	passwordSalt: blob('password_salt', { mode: 'buffer' }).$type<Uint8Array>().notNull(),
	passwordVerifier: blob('password_verifier', { mode: 'buffer' }).$type<Uint8Array>().notNull()
});

export type Pad = typeof pads.$inferSelect;
export type NewPad = typeof pads.$inferInsert;

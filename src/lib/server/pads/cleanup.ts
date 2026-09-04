import { lte } from 'drizzle-orm';

import { getDb } from '../db';
import { pads } from '../db/schema';
import { getPadExpiryCutoff } from './model';

export async function deleteExpiredPads(
	database: D1Database,
	now = Math.floor(Date.now() / 1000)
): Promise<number> {
	const db = getDb(database);
	const deleted = await db
		.delete(pads)
		.where(lte(pads.updatedAt, getPadExpiryCutoff(now)))
		.returning({ id: pads.id });

	return deleted.length;
}

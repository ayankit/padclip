import { and, count, eq, gt } from 'drizzle-orm';

import { getDb } from '$lib/server/db';
import { padAuth, pads } from '$lib/server/db/schema';
import {
	MAX_CONTENT_BYTES,
	generatePadId,
	getContentByteLength,
	getPadExpiryCutoff
} from '$lib/server/pads/model';

const MAX_CREATE_ATTEMPTS = 8;

export interface StoredPad {
	id: string;
	content: string;
	contentBytes: number;
	version: number;
	createdAt: number;
	updatedAt: number;
}

export interface StoredPadAuth {
	passwordSalt: Uint8Array;
	passwordVerifier: Uint8Array;
}

export type SavePadResult =
	| { status: 'saved'; version: number; updatedAt: number }
	| { status: 'conflict'; pad: StoredPad }
	| { status: 'not_found' };

function isPadIdCollision(error: unknown): boolean {
	return error instanceof Error && error.message.includes('UNIQUE constraint failed: pads.id');
}

export async function createPad(
	database: D1Database,
	content: string,
	passwordSalt: Uint8Array,
	passwordVerifier: Uint8Array
): Promise<StoredPad> {
	const contentBytes = getContentByteLength(content);

	if (contentBytes > MAX_CONTENT_BYTES) throw new Error('Pad content exceeds the size limit.');

	for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
		const id = generatePadId();
		const now = Math.floor(Date.now() / 1000);
		const pad: StoredPad = {
			id,
			content,
			contentBytes,
			version: 1,
			createdAt: now,
			updatedAt: now
		};
		const db = getDb(database);

		try {
			await db.batch([
				db.insert(pads).values(pad),
				db.insert(padAuth).values({
					padId: id,
					passwordSalt,
					passwordVerifier
				})
			]);

			return pad;
		} catch (error) {
			if (!isPadIdCollision(error)) throw error;
		}
	}

	throw new Error('Could not allocate a unique pad ID.');
}

export async function getPad(
	database: D1Database,
	padId: string,
	now = Math.floor(Date.now() / 1000)
): Promise<StoredPad | null> {
	const db = getDb(database);
	const [pad] = await db
		.select()
		.from(pads)
		.where(and(eq(pads.id, padId), gt(pads.updatedAt, getPadExpiryCutoff(now))))
		.limit(1);

	return pad ?? null;
}

export async function getPadAuth(
	database: D1Database,
	padId: string,
	now = Math.floor(Date.now() / 1000)
): Promise<StoredPadAuth | null> {
	const db = getDb(database);
	const [auth] = await db
		.select({
			passwordSalt: padAuth.passwordSalt,
			passwordVerifier: padAuth.passwordVerifier
		})
		.from(padAuth)
		.innerJoin(pads, eq(padAuth.padId, pads.id))
		.where(and(eq(padAuth.padId, padId), gt(pads.updatedAt, getPadExpiryCutoff(now))))
		.limit(1);

	return auth ?? null;
}

export async function savePad(
	database: D1Database,
	padId: string,
	content: string,
	expectedVersion: number,
	now = Math.floor(Date.now() / 1000)
): Promise<SavePadResult> {
	const contentBytes = getContentByteLength(content);

	if (contentBytes > MAX_CONTENT_BYTES) throw new Error('Pad content exceeds the size limit.');

	const db = getDb(database);
	const updatedAt = now;
	const [updated] = await db
		.update(pads)
		.set({
			content,
			contentBytes,
			version: expectedVersion + 1,
			updatedAt
		})
		.where(
			and(
				eq(pads.id, padId),
				eq(pads.version, expectedVersion),
				gt(pads.updatedAt, getPadExpiryCutoff(now))
			)
		)
		.returning({ version: pads.version });

	if (updated) return { status: 'saved', version: updated.version, updatedAt };

	const current = await getPad(database, padId, now);

	return current ? { status: 'conflict', pad: current } : { status: 'not_found' };
}

export async function countActivePads(
	database: D1Database,
	now = Math.floor(Date.now() / 1000)
): Promise<number> {
	const db = getDb(database);
	const [result] = await db
		.select({ value: count() })
		.from(pads)
		.where(gt(pads.updatedAt, getPadExpiryCutoff(now)));

	return result?.value ?? 0;
}

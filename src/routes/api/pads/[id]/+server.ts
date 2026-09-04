import type { RequestHandler } from './$types';

import { getWorkerEnv, hasExpectedOrigin, hasValidPadSession, noStoreJson } from '$lib/server/http';
import { MAX_CONTENT_BYTES, getContentByteLength, isValidPadId } from '$lib/server/pads/model';
import { getPad, savePad } from '$lib/server/pads/repository';

export const GET: RequestHandler = async ({ params, platform, cookies }) => {
	if (!isValidPadId(params.id)) {
		return noStoreJson({ error: 'not_found' }, { status: 404 });
	}

	const env = getWorkerEnv(platform);
	const pad = await getPad(env.DB, params.id);

	if (!pad) return noStoreJson({ error: 'not_found' }, { status: 404 });

	if (!(await hasValidPadSession(cookies, params.id, env.SESSION_SIGNING_KEY))) {
		return noStoreJson({ error: 'password_required' }, { status: 401 });
	}

	return noStoreJson({
		id: pad.id,
		content: pad.content,
		contentBytes: pad.contentBytes,
		version: pad.version,
		updatedAt: pad.updatedAt
	});
};

export const PUT: RequestHandler = async ({ request, url, params, platform, cookies }) => {
	if (!isValidPadId(params.id)) {
		return noStoreJson({ error: 'not_found' }, { status: 404 });
	}

	if (!hasExpectedOrigin(request, url)) {
		return noStoreJson({ error: 'invalid_origin' }, { status: 403 });
	}

	const env = getWorkerEnv(platform);

	if (!(await hasValidPadSession(cookies, params.id, env.SESSION_SIGNING_KEY))) {
		return noStoreJson({ error: 'password_required' }, { status: 401 });
	}

	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return noStoreJson({ error: 'invalid_request' }, { status: 400 });
	}

	if (!body || typeof body !== 'object') {
		return noStoreJson({ error: 'invalid_request' }, { status: 400 });
	}

	const { content, expectedVersion } = body as Record<string, unknown>;

	if (
		typeof content !== 'string' ||
		typeof expectedVersion !== 'number' ||
		!Number.isInteger(expectedVersion) ||
		expectedVersion < 1
	) {
		return noStoreJson({ error: 'invalid_request' }, { status: 400 });
	}

	if (getContentByteLength(content) > MAX_CONTENT_BYTES) {
		return noStoreJson({ error: 'content_too_large', maxBytes: MAX_CONTENT_BYTES }, { status: 413 });
	}

	const result = await savePad(env.DB, params.id, content, expectedVersion);

	if (result.status === 'not_found') {
		return noStoreJson({ error: 'not_found' }, { status: 404 });
	}

	if (result.status === 'conflict') {
		return noStoreJson(
			{
				error: 'conflict',
				content: result.pad.content,
				version: result.pad.version,
				updatedAt: result.pad.updatedAt
			},
			{ status: 409 }
		);
	}

	return noStoreJson({ version: result.version, updatedAt: result.updatedAt });
};

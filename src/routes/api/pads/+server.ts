import type { RequestHandler } from './$types';

import {
	createPasswordVerifier,
	generatePasswordSalt,
	getPasswordValidationError
} from '$lib/server/auth/password';
import { getWorkerEnv, hasExpectedOrigin, noStoreJson, setPadSessionCookie } from '$lib/server/http';
import { MAX_CONTENT_BYTES, getContentByteLength } from '$lib/server/pads/model';
import { createPad } from '$lib/server/pads/repository';

export const POST: RequestHandler = async ({ request, url, platform, cookies }) => {
	if (!hasExpectedOrigin(request, url)) {
		return noStoreJson({ error: 'invalid_origin' }, { status: 403 });
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

	const { password, content = '' } = body as Record<string, unknown>;

	if (typeof password !== 'string' || typeof content !== 'string') {
		return noStoreJson({ error: 'invalid_request' }, { status: 400 });
	}

	const passwordError = getPasswordValidationError(password);

	if (passwordError) {
		return noStoreJson({ error: 'invalid_password', message: passwordError }, { status: 400 });
	}

	if (getContentByteLength(content) > MAX_CONTENT_BYTES) {
		return noStoreJson({ error: 'content_too_large', maxBytes: MAX_CONTENT_BYTES }, { status: 413 });
	}

	const env = getWorkerEnv(platform);
	const salt = generatePasswordSalt();
	const verifier = await createPasswordVerifier(password, salt);
	const pad = await createPad(env.DB, content, salt, verifier);

	await setPadSessionCookie(cookies, pad.id, env.SESSION_SIGNING_KEY);

	return noStoreJson(
		{ id: pad.id, url: `/p/${pad.id}`, version: pad.version },
		{ status: 201, headers: { Location: `/p/${pad.id}` } }
	);
};

import type { RequestHandler } from './$types';

import {
	createPasswordVerifier,
	generatePasswordSalt,
	getPasswordValidationError
} from '$lib/server/auth/password';
import { getWorkerEnv, hasExpectedOrigin, noStoreJson, setPadSessionCookie } from '$lib/server/http';
import { MAX_ACTIVE_PADS, MAX_CONTENT_BYTES, getContentByteLength } from '$lib/server/pads/model';
import { countActivePads, createPad } from '$lib/server/pads/repository';
import { passesRateLimits } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ request, url, platform, cookies }) => {
	if (!hasExpectedOrigin(request, url)) {
		return noStoreJson({ error: 'invalid_origin' }, { status: 403 });
	}

	const env = getWorkerEnv(platform);
	const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown';
	const allowed = await passesRateLimits([
		{ binding: env.CLIENT_CREATE_RATE_LIMITER, key: clientAddress },
		{ binding: env.GLOBAL_CREATE_RATE_LIMITER, key: 'create' }
	]);

	if (!allowed) {
		return noStoreJson(
			{ error: 'rate_limited', message: 'Too many pads are being created. Try again in a minute.' },
			{ status: 429, headers: { 'Retry-After': '60' } }
		);
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

	if ((await countActivePads(env.DB)) >= MAX_ACTIVE_PADS) {
		return noStoreJson(
			{ error: 'capacity_reached', message: 'Pad capacity has been reached. Try again later.' },
			{ status: 503, headers: { 'Retry-After': '3600' } }
		);
	}

	const salt = generatePasswordSalt();
	const verifier = await createPasswordVerifier(password, salt);
	const pad = await createPad(env.DB, content, salt, verifier);

	await setPadSessionCookie(cookies, pad.id, env.SESSION_SIGNING_KEY);

	return noStoreJson(
		{ id: pad.id, url: `/p/${pad.id}`, version: pad.version },
		{ status: 201, headers: { Location: `/p/${pad.id}` } }
	);
};

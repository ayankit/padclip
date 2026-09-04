import type { RequestHandler } from './$types';

import { getPasswordValidationError, verifyPassword } from '$lib/server/auth/password';
import { getWorkerEnv, hasExpectedOrigin, noStoreJson, setPadSessionCookie } from '$lib/server/http';
import { isValidPadId } from '$lib/server/pads/model';
import { getPadAuth } from '$lib/server/pads/repository';

export const POST: RequestHandler = async ({ request, url, params, platform, cookies }) => {
	if (!isValidPadId(params.id)) {
		return noStoreJson({ error: 'not_found' }, { status: 404 });
	}

	if (!hasExpectedOrigin(request, url)) {
		return noStoreJson({ error: 'invalid_origin' }, { status: 403 });
	}

	const env = getWorkerEnv(platform);
	const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown';
	const [padLimit, clientLimit] = await Promise.all([
		env.PAD_UNLOCK_RATE_LIMITER.limit({ key: params.id }),
		env.CLIENT_UNLOCK_RATE_LIMITER.limit({ key: clientAddress })
	]);

	if (!padLimit.success || !clientLimit.success) {
		return noStoreJson(
			{ error: 'rate_limited', message: 'Too many password attempts. Try again in a minute.' },
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

	const { password } = body as Record<string, unknown>;

	if (typeof password !== 'string' || getPasswordValidationError(password)) {
		return noStoreJson({ error: 'invalid_password', message: 'Incorrect password.' }, { status: 401 });
	}

	const auth = await getPadAuth(env.DB, params.id);

	if (!auth) return noStoreJson({ error: 'not_found' }, { status: 404 });

	if (!(await verifyPassword(password, auth.passwordSalt, auth.passwordVerifier))) {
		return noStoreJson({ error: 'invalid_password', message: 'Incorrect password.' }, { status: 401 });
	}

	await setPadSessionCookie(cookies, params.id, env.SESSION_SIGNING_KEY);

	return noStoreJson({ unlocked: true });
};

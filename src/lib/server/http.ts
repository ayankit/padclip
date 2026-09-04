import { error, json, type Cookies } from '@sveltejs/kit';

import {
	SESSION_TTL_SECONDS,
	createPadSession,
	getPadSessionCookieName,
	verifyPadSession
} from '$lib/server/auth/session';

export function getWorkerEnv(platform: App.Platform | undefined): Env {
	if (!platform?.env) error(503, 'Worker bindings are unavailable.');

	return platform.env;
}

export function noStoreJson(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set('Cache-Control', 'no-store');

	return json(data, { ...init, headers });
}

export function hasExpectedOrigin(request: Request, url: URL): boolean {
	return request.headers.get('origin') === url.origin;
}

export async function setPadSessionCookie(
	cookies: Cookies,
	padId: string,
	signingKey: string
): Promise<void> {
	const token = await createPadSession(padId, signingKey);

	cookies.set(getPadSessionCookieName(padId), token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: SESSION_TTL_SECONDS
	});
}

export async function hasValidPadSession(
	cookies: Cookies,
	padId: string,
	signingKey: string
): Promise<boolean> {
	const token = cookies.get(getPadSessionCookieName(padId));

	return token ? verifyPadSession(token, padId, signingKey) : false;
}

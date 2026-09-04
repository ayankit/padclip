import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SESSION_TTL_SECONDS,
	createPadSession,
	getPadSessionCookieName,
	verifyPadSession
} from '../src/lib/server/auth/session.ts';

const signingKey = '0123456789abcdef0123456789abcdef';
const otherSigningKey = 'abcdef0123456789abcdef0123456789';
const issuedAt = 1_788_512_400;

test('session is valid only for its pad and lifetime', async () => {
	const token = await createPadSession('Ab3xYz', signingKey, issuedAt);

	assert.equal(await verifyPadSession(token, 'Ab3xYz', signingKey, issuedAt), true);
	assert.equal(await verifyPadSession(token, 'Qr7sTu', signingKey, issuedAt), false);
	assert.equal(
		await verifyPadSession(token, 'Ab3xYz', signingKey, issuedAt + SESSION_TTL_SECONDS),
		false
	);
});

test('session rejects tampering and signing-key rotation', async () => {
	const token = await createPadSession('Ab3xYz', signingKey, issuedAt);
	const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

	assert.equal(await verifyPadSession(tampered, 'Ab3xYz', signingKey, issuedAt), false);
	assert.equal(await verifyPadSession(token, 'Ab3xYz', otherSigningKey, issuedAt), false);
});

test('session cookie names are bound to a pad ID', () => {
	assert.equal(getPadSessionCookieName('Ab3xYz'), '__Host-clipped-pad-Ab3xYz');
	assert.throws(() => getPadSessionCookieName('../bad'));
});

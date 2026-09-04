import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createPasswordVerifier,
	generatePasswordSalt,
	getPasswordValidationError,
	verifyPassword
} from '../src/lib/server/auth/password.ts';

test('password verifier accepts only the original password', async () => {
	const salt = generatePasswordSalt();
	const verifier = await createPasswordVerifier('correct horse battery staple', salt);

	assert.equal(await verifyPassword('correct horse battery staple', salt, verifier), true);
	assert.equal(await verifyPassword('incorrect horse battery staple', salt, verifier), false);
});

test('salts produce different password verifiers', async () => {
	const first = await createPasswordVerifier('same password', generatePasswordSalt());
	const second = await createPasswordVerifier('same password', generatePasswordSalt());

	assert.notDeepEqual(first, second);
});

test('password validation uses UTF-8 byte length', () => {
	assert.match(getPasswordValidationError('short') ?? '', /at least/);
	assert.equal(getPasswordValidationError('correct horse battery staple'), null);
	assert.equal(getPasswordValidationError('密碼密碼密碼'), null);
});

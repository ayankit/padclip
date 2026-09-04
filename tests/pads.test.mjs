import assert from 'node:assert/strict';
import test from 'node:test';

import {
	MAX_ACTIVE_PADS,
	MAX_CONTENT_BYTES,
	PAD_LIFETIME_SECONDS,
	generatePadId,
	getContentByteLength,
	getPadExpiryCutoff,
	isPadExpired,
	isValidPadId
} from '../src/lib/server/pads/model.ts';

test('pad IDs use six case-sensitive alphanumeric characters', () => {
	for (let index = 0; index < 100; index += 1) {
		assert.match(generatePadId(), /^[A-Za-z0-9]{6}$/);
	}

	assert.equal(isValidPadId('Ab3xYz'), true);
	assert.equal(isValidPadId('short'), false);
});

test('content size is measured as UTF-8 bytes', () => {
	assert.equal(getContentByteLength('plain'), 5);
	assert.equal(getContentByteLength('密碼'), 6);
	assert.equal(typeof MAX_CONTENT_BYTES, 'number');
	assert.equal(MAX_ACTIVE_PADS, 10_000);
});

test('pads expire exactly 24 hours after their last save', () => {
	const now = 1_788_512_400;
	const cutoff = getPadExpiryCutoff(now);

	assert.equal(cutoff, now - PAD_LIFETIME_SECONDS);
	assert.equal(isPadExpired(cutoff + 1, now), false);
	assert.equal(isPadExpired(cutoff, now), true);
	assert.equal(isPadExpired(cutoff - 1, now), true);
});

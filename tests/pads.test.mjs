import assert from 'node:assert/strict';
import test from 'node:test';

import {
	MAX_CONTENT_BYTES,
	generatePadId,
	getContentByteLength,
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
});

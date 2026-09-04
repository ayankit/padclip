import assert from 'node:assert/strict';
import test from 'node:test';

import { passesRateLimits } from '../src/lib/server/rate-limit.ts';

function createLimiter(success) {
	const keys = [];

	return {
		keys,
		binding: {
			async limit({ key }) {
				keys.push(key);
				return { success };
			}
		}
	};
}

test('creation proceeds only when every rate limiter allows it', async () => {
	const client = createLimiter(true);
	const global = createLimiter(true);

	assert.equal(
		await passesRateLimits([
			{ binding: client.binding, key: '203.0.113.10' },
			{ binding: global.binding, key: 'create' }
		]),
		true
	);
	assert.deepEqual(client.keys, ['203.0.113.10']);
	assert.deepEqual(global.keys, ['create']);
});

test('one rejected rate limit blocks creation', async () => {
	const client = createLimiter(false);
	const global = createLimiter(true);

	assert.equal(
		await passesRateLimits([
			{ binding: client.binding, key: '203.0.113.10' },
			{ binding: global.binding, key: 'create' }
		]),
		false
	);
});

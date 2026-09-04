interface RateLimitBinding {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface RateLimitCheck {
	binding: RateLimitBinding;
	key: string;
}

export async function passesRateLimits(checks: RateLimitCheck[]): Promise<boolean> {
	const results = await Promise.all(checks.map(({ binding, key }) => binding.limit({ key })));

	return results.every(({ success }) => success);
}

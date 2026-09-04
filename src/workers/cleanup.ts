import { deleteExpiredPads } from '../lib/server/pads/cleanup';

interface CleanupEnv {
	DB: D1Database;
}

export default {
	scheduled(controller, env, ctx) {
		const now = Math.floor(controller.scheduledTime / 1000);

		ctx.waitUntil(deleteExpiredPads(env.DB, now));
	}
} satisfies ExportedHandler<CleanupEnv>;

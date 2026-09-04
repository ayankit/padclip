<script lang="ts">
	import { goto } from '$app/navigation';
	import MarkdownEditor from '$lib/MarkdownEditor.svelte';

	let password = $state('');
	let passwordConfirmation = $state('');
	let content = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');

	async function createPad(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';

		if (password !== passwordConfirmation) {
			errorMessage = 'Passwords do not match.';
			return;
		}

		submitting = true;

		try {
			const response = await fetch('/api/pads', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password, content })
			});
			const result = (await response.json()) as {
				url?: string;
				message?: string;
			};

			if (!response.ok || !result.url) {
				errorMessage = result.message ?? 'The pad could not be created.';
				return;
			}

			password = '';
			passwordConfirmation = '';
			await goto(result.url);
		} catch {
			errorMessage = 'The pad could not be created.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>New pad · Clipped</title>
	<meta name="description" content="Create a temporary password-protected Markdown pad." />
</svelte:head>

<main class="min-h-dvh bg-zinc-100 px-4 py-8 text-zinc-950 sm:px-6">
	<form class="mx-auto grid max-w-5xl gap-6" onsubmit={createPad}>
		<header>
			<h1 class="text-3xl font-semibold tracking-tight">Create a temporary pad</h1>
			<p class="mt-2 max-w-2xl text-sm text-zinc-600">
				The pad expires 24 hours after its last save. There is no password recovery or password
				change.
			</p>
		</header>

		<div class="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2">
			<label class="grid gap-1.5 text-sm font-medium">
				Password
				<input
					class="rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-zinc-950"
					type="password"
					bind:value={password}
					minlength="8"
					maxlength="256"
					autocomplete="new-password"
					required
				/>
			</label>

			<label class="grid gap-1.5 text-sm font-medium">
				Confirm password
				<input
					class="rounded-md border border-zinc-300 px-3 py-2 font-normal outline-none focus:border-zinc-950"
					type="password"
					bind:value={passwordConfirmation}
					minlength="8"
					maxlength="256"
					autocomplete="new-password"
					required
				/>
			</label>
		</div>

		<section class="grid h-[55vh] min-h-80 gap-2">
			<label class="text-sm font-medium" for="initial-content">Initial Markdown</label>
			<div id="initial-content" class="min-h-0">
				<MarkdownEditor bind:value={content} label="Initial Markdown" />
			</div>
		</section>

		<footer class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-sm text-red-700" role="alert">{errorMessage}</p>
			<button
				class="ml-auto rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
				type="submit"
				disabled={submitting}
			>
				{submitting ? 'Creating…' : 'Create pad'}
			</button>
		</footer>
	</form>
</main>

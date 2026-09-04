<script lang="ts">
	import { page } from '$app/state';
	import MarkdownEditor from '$lib/MarkdownEditor.svelte';
	import { onMount } from 'svelte';

	type ViewState = 'loading' | 'locked' | 'ready' | 'recovery' | 'not_found' | 'error';
	type UnlockIntent = 'initial_load' | 'resume_save';

	const maxContentBytes = 1_500_000;
	const padId = $derived(page.params.id);
	let viewState = $state<ViewState>('loading');
	let password = $state('');
	let content = $state('');
	let savedContent = $state('');
	let version = $state(0);
	let saving = $state(false);
	let unlocking = $state(false);
	let message = $state('');
	let conflictContent = $state<string | null>(null);
	let conflictVersion = $state<number | null>(null);
	let unlockIntent = $state<UnlockIntent>('initial_load');
	const contentBytes = $derived(new TextEncoder().encode(content).byteLength);
	const dirty = $derived(content !== savedContent);

	async function loadPad() {
		viewState = 'loading';
		message = '';

		try {
			const response = await fetch(`/api/pads/${padId}`);

			if (response.status === 401) {
				unlockIntent = 'initial_load';
				viewState = 'locked';
				return;
			}

			if (response.status === 404) {
				viewState = 'not_found';
				return;
			}

			if (!response.ok) throw new Error('Load failed');

			const pad = (await response.json()) as { content: string; version: number };
			content = pad.content;
			savedContent = pad.content;
			version = pad.version;
			conflictContent = null;
			conflictVersion = null;
			viewState = 'ready';
		} catch {
			viewState = 'error';
			message = 'The pad could not be loaded.';
		}
	}

	async function unlockPad(event: SubmitEvent) {
		event.preventDefault();
		unlocking = true;
		message = '';

		try {
			const response = await fetch(`/api/pads/${padId}/unlock`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});
			const result = (await response.json()) as { message?: string };

			if (!response.ok) {
				message = result.message ?? 'The pad could not be unlocked.';
				if (response.status === 404) viewState = 'not_found';
				return;
			}

			password = '';

			if (unlockIntent === 'resume_save') {
				unlockIntent = 'initial_load';
				viewState = 'ready';
				await save();
			} else {
				await loadPad();
			}
		} catch {
			message = 'The pad could not be unlocked.';
		} finally {
			unlocking = false;
		}
	}

	async function save() {
		if (!dirty || saving || contentBytes > maxContentBytes) return;

		saving = true;
		message = '';

		try {
			const response = await fetch(`/api/pads/${padId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content, expectedVersion: version })
			});
			const result = (await response.json()) as {
				content?: string;
				version?: number;
				message?: string;
			};

			if (response.status === 409 && result.content !== undefined && result.version !== undefined) {
				conflictContent = result.content;
				conflictVersion = result.version;
				message = 'This pad changed in another browser. Your local edits have not been replaced.';
				return;
			}

			if (response.status === 401) {
				unlockIntent = 'resume_save';
				viewState = 'locked';
				message = 'Your session expired. Unlock to save your draft.';
				return;
			}

			if (response.status === 404) {
				viewState = dirty ? 'recovery' : 'not_found';
				if (dirty) message = 'The pad expired or was removed. Copy your draft before leaving.';
				return;
			}

			if (!response.ok || result.version === undefined) {
				message = result.message ?? 'The pad could not be saved.';
				return;
			}

			version = result.version;
			savedContent = content;
			message = 'Saved.';
		} catch {
			message = 'The pad could not be saved.';
		} finally {
			saving = false;
		}
	}

	async function copyDraft() {
		try {
			await navigator.clipboard.writeText(content);
			message = 'Draft copied.';
		} catch {
			message = 'The draft could not be copied. Select the text in the editor instead.';
		}
	}

	function loadConflictingVersion() {
		if (conflictContent === null || conflictVersion === null) return;

		content = conflictContent;
		savedContent = conflictContent;
		version = conflictVersion;
		conflictContent = null;
		conflictVersion = null;
		message = 'Loaded the latest saved version.';
	}

	onMount(() => {
		void loadPad();

		const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
			if (!dirty) return;
			event.preventDefault();
		};

		window.addEventListener('beforeunload', warnBeforeLeaving);
		return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
	});
</script>

<svelte:head>
	<title>{padId} · Clipped</title>
	<meta name="description" content="A temporary password-protected Markdown pad." />
</svelte:head>

<main class="grid min-h-dvh bg-zinc-100 text-zinc-950">
	{#if viewState === 'loading'}
		<p class="m-auto text-sm text-zinc-600">Loading pad…</p>
	{:else if viewState === 'locked'}
		<form class="m-auto grid w-full max-w-sm gap-4 px-5" onsubmit={unlockPad}>
			<header>
				<p class="font-mono text-xs text-zinc-500">{padId}</p>
				<h1 class="mt-1 text-2xl font-semibold">Password required</h1>
			</header>
			<label class="grid gap-1.5 text-sm font-medium">
				Password
				<input
					class="rounded-md border border-zinc-300 bg-white px-3 py-2 font-normal outline-none focus:border-zinc-950"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					required
				/>
			</label>
			<p class="min-h-5 text-sm text-red-700" role="alert">{message}</p>
			<button
				class="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
				type="submit"
				disabled={unlocking}
			>
				{unlocking ? 'Unlocking…' : 'Unlock'}
			</button>
		</form>
	{:else if viewState === 'ready'}
		<section class="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto]">
			<header class="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
				<a class="font-semibold" href="/">Clipped</a>
				<span class="font-mono text-xs text-zinc-500">{padId}</span>
				<span class="ml-auto text-xs text-zinc-500">Version {version}</span>
				<button
					class="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
					type="button"
					disabled={!dirty || saving || contentBytes > maxContentBytes}
					onclick={save}
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</header>

			<div class="min-h-0 p-3 sm:p-5">
				<MarkdownEditor bind:value={content} label={`Markdown pad ${padId}`} />
			</div>

			<footer class="flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-600">
				<span>{contentBytes.toLocaleString()} / {maxContentBytes.toLocaleString()} bytes</span>
				{#if dirty}<span>Unsaved changes</span>{/if}
				<p class="ml-auto" class:text-red-700={conflictContent !== null}>{message}</p>
				{#if conflictContent !== null}
					<button class="font-medium underline" type="button" onclick={loadConflictingVersion}>
						Discard local edits and load latest
					</button>
				{/if}
			</footer>
		</section>
	{:else if viewState === 'recovery'}
		<section class="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto]">
			<header class="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
				<a class="font-semibold" href="/">Clipped</a>
				<span class="font-mono text-xs text-zinc-500">{padId}</span>
				<span class="ml-auto text-sm font-medium text-red-700">Pad unavailable</span>
			</header>

			<div class="min-h-0 p-3 sm:p-5">
				<MarkdownEditor bind:value={content} label={`Recover Markdown pad ${padId}`} />
			</div>

			<footer class="flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-600">
				<p class="text-red-700">{message}</p>
				<button class="ml-auto font-medium underline" type="button" onclick={copyDraft}>
					Copy draft
				</button>
			</footer>
		</section>
	{:else if viewState === 'not_found'}
		<section class="m-auto grid justify-items-center gap-3 px-5 text-center">
			<h1 class="text-2xl font-semibold">Pad not found</h1>
			<p class="text-sm text-zinc-600">It may have expired or been removed.</p>
			<a class="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white" href="/">
				Create a new pad
			</a>
		</section>
	{:else}
		<section class="m-auto grid justify-items-center gap-3 px-5 text-center">
			<h1 class="text-2xl font-semibold">Could not load the pad</h1>
			<p class="text-sm text-red-700">{message}</p>
			<button class="text-sm font-medium underline" type="button" onclick={loadPad}>Try again</button>
		</section>
	{/if}
</main>

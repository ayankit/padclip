<script lang="ts">
	import { indentWithTab } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { languages } from '@codemirror/language-data';
	import { EditorView, keymap } from '@codemirror/view';
	import { basicSetup } from 'codemirror';
	import { onMount } from 'svelte';

	let {
		value = $bindable(''),
		label = 'Markdown editor'
	}: {
		value?: string;
		label?: string;
	} = $props();

	let editorHost: HTMLDivElement;
	let editor: EditorView | undefined;

	onMount(() => {
		editor = new EditorView({
			doc: value,
			extensions: [
				basicSetup,
				keymap.of([indentWithTab]),
				markdown({ codeLanguages: languages }),
				EditorView.lineWrapping,
				EditorView.updateListener.of((update) => {
					if (update.docChanged) value = update.state.doc.toString();
				})
			],
			parent: editorHost
		});

		return () => editor?.destroy();
	});

	$effect(() => {
		if (!editor) return;

		const currentValue = editor.state.doc.toString();

		if (currentValue !== value) {
			editor.dispatch({ changes: { from: 0, to: currentValue.length, insert: value } });
		}
	});
</script>

<div
	class="h-full min-h-0 overflow-hidden rounded-lg border border-zinc-300 bg-white text-zinc-950 [&_.cm-content]:min-h-full [&_.cm-content]:px-4 [&_.cm-content]:py-4 [&_.cm-editor]:h-full [&_.cm-editor.cm-focused]:outline-none [&_.cm-gutters]:border-r [&_.cm-gutters]:border-zinc-200 [&_.cm-gutters]:bg-zinc-50 [&_.cm-scroller]:overflow-auto"
	bind:this={editorHost}
	role="textbox"
	aria-label={label}
></div>

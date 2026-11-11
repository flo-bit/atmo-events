<script lang="ts">
	import { Button, Checkbox } from '@atmo-dev/kit';
	import { browser } from '$app/env';
	import { requestPermissions } from '@svelte-atproto/oauth/client';
	import { BETA_REQUIREMENTS, BETA_SCOPE, BETA_WARNING } from '../beta';
	import { getPrivateEventsBeta, setPrivateEventsBeta } from '../private-events.remote';

	// Only in the browser. On a Worker, a query started while the page renders on the server
	// outlives that request, which cancels its I/O, and the OAuth session lock it took never
	// settles, so every later request on that session waits for good.
	const beta = browser ? getPrivateEventsBeta() : null;

	/** The box as the person left it; null until they touch it. */
	let choice: boolean | null = $state(null);
	let saving = $state(false);
	let authorizing = $state(false);
	let failure = $state('');
	let saved = $state(false);

	async function authorize() {
		authorizing = true;
		failure = '';
		try {
			await requestPermissions(BETA_SCOPE, {
				requirements: [...BETA_REQUIREMENTS],
				saveReturnTo: true
			});
			// Returns without navigating when access is already granted.
			await beta?.refresh();
		} catch {
			failure = 'Could not authorize access. Try again.';
		} finally {
			authorizing = false;
		}
	}

	async function save() {
		saving = true;
		failure = '';
		saved = false;
		try {
			await setPrivateEventsBeta({ on: choice ?? beta?.current?.on ?? false }).updates(
				...(beta ? [beta] : [])
			);
			choice = null;
			saved = true;
		} catch (e) {
			const message = (e as { body?: { message?: unknown } } | null)?.body?.message;
			failure = typeof message === 'string' ? message : 'Could not save this setting. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<section
	class="grid gap-4"
	aria-labelledby="private-events-beta-heading"
	data-testid="private-events-beta"
>
	<h2 id="private-events-beta-heading" class="font-semibold">Private events (beta)</h2>
	<p class="text-base-600 dark:text-base-400 text-sm">
		Make events that only the people you add can see. {BETA_WARNING}
	</p>
	{#if beta?.error}
		<p class="text-base-600 dark:text-base-400 text-sm" role="alert">
			Could not load this setting.
		</p>
		<Button variant="secondary" class="justify-self-start" onclick={() => beta?.refresh()}
			>Try again</Button
		>
	{:else if !beta?.ready}
		<p class="text-base-600 dark:text-base-400 text-sm" role="status">Loading…</p>
	{:else if !beta.current.canSave}
		<p class="text-base-600 dark:text-base-400 text-sm">
			We need additional permission to save this setting.
		</p>
		<Button onclick={authorize} disabled={authorizing} class="justify-self-start">
			{authorizing ? 'Authorizing…' : 'Authorize now'}
		</Button>
		{#if failure}<p role="alert" class="text-base-950 dark:text-base-50 text-sm">{failure}</p>{/if}
	{:else}
		<label class="flex cursor-pointer items-start gap-3">
			<Checkbox
				bind:checked={() => choice ?? beta.current.on, (value) => (choice = value)}
				disabled={saving}
				class="mt-0.5"
			/>
			<span>
				<span class="text-base-950 dark:text-base-50 block text-sm font-medium"
					>Try private events</span
				>
				<span class="text-base-600 dark:text-base-400 mt-1 block text-xs leading-relaxed">
					Adds a Private events tab, and “Invited people only” when you create an event.
				</span>
			</span>
		</label>
		<p class="text-base-600 dark:text-base-400 text-sm">
			Your choice is saved in your account, where anyone can see it.
		</p>
		<Button onclick={save} disabled={saving} class="justify-self-start"
			>{saving ? 'Saving…' : 'Save'}</Button
		>
		{#if failure}<p role="alert" class="text-base-950 dark:text-base-50 text-sm">{failure}</p>
		{:else if saved}<p role="status" class="text-base-600 dark:text-base-400 text-sm">
				Saved.
			</p>{/if}
	{/if}
</section>

<script lang="ts">
	import { Button } from '@atmo-dev/kit';
	import { browser } from '$app/env';
	import { resolve } from '$app/paths';
	import { requestPermissions } from '@svelte-atproto/oauth/client';
	import { BETA_REQUIREMENTS, BETA_SCOPE } from '../beta';
	import { getPrivateEventsBeta, setPrivateEventsBeta } from '../private-events.remote';

	// For a guest who answered without the beta: the one place that offers it, so they can find the
	// event again. Your events on the home page lists private events only for people who turned it
	// on. Read in the browser only, as Settings does: on a Worker a query started while the page
	// renders on the server outlives the request.
	const beta = browser ? getPrivateEventsBeta() : null;

	// Saving it can first need one more permission, which leaves the page. This keeps the click
	// across that, so it finishes on the way back without a second one.
	const PENDING = 'atmo:turn-on-private-events';
	function pending(set?: boolean): boolean {
		try {
			if (set === true) sessionStorage.setItem(PENDING, '1');
			if (set === false) sessionStorage.removeItem(PENDING);
			return sessionStorage.getItem(PENDING) === '1';
		} catch {
			return false;
		}
	}

	let saving = $state(false);
	let turnedOn = $state(false);
	let failure = $state('');

	async function save() {
		saving = true;
		failure = '';
		try {
			await setPrivateEventsBeta({ on: true }).updates(...(beta ? [beta] : []));
			turnedOn = true;
		} catch (e) {
			const message = (e as { body?: { message?: unknown } } | null)?.body?.message;
			failure = typeof message === 'string' ? message : 'Could not turn it on. Try again.';
		} finally {
			pending(false);
			saving = false;
		}
	}

	async function turnOn() {
		if (beta?.current?.canSave) return save();
		pending(true);
		saving = true;
		failure = '';
		try {
			await requestPermissions(BETA_SCOPE, {
				requirements: [...BETA_REQUIREMENTS],
				saveReturnTo: true
			});
			// Returns without leaving the page when the permission is already there.
			await beta?.refresh();
			saving = false;
			if (beta?.current?.canSave) await save();
		} catch {
			pending(false);
			failure = 'Could not authorize access. Try again.';
		} finally {
			saving = false;
		}
	}

	// Back from granting the permission: finish what the click started.
	$effect(() => {
		if (beta?.current?.canSave && !beta.current.on && !saving && !turnedOn && pending()) {
			void save();
		}
	});
</script>

{#if turnedOn}
	<p class="text-base-600 dark:text-base-400 text-sm" role="status" data-testid="find-again">
		Private events are on. Find this again in
		<a href={resolve('/(app)')} class="text-accent-600 dark:text-accent-400 hover:underline"
			>Your events</a
		>, on the home page.
	</p>
{:else if beta?.ready && !beta.current.on}
	<div class="text-base-600 dark:text-base-400 text-sm" data-testid="find-again">
		<p>
			Turn on private events to find this again in Your events, on the home page. The choice is
			saved in your account, where anyone can see it.
		</p>
		<Button class="mt-2" size="sm" variant="secondary" disabled={saving} onclick={turnOn}>
			{saving ? 'Turning on…' : 'Turn on private events'}
		</Button>
		{#if failure}<p role="alert" class="text-base-950 dark:text-base-50 mt-2">{failure}</p>{/if}
	</div>
{/if}

<script lang="ts">
	import { Button } from '@foxui/core';
	import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
	import { enableNotifications, disableNotifications } from '$lib/notify/settings.remote';

	let { data } = $props();

	let notifyState = $state(data.state);
	let pending = $state(false);
	let busy = $state(false);
	let errorMsg = $state('');

	async function enable() {
		busy = true;
		errorMsg = '';
		try {
			const res = await enableNotifications();
			if (res.status === 'enabled') {
				notifyState = 'enabled';
				pending = false;
			} else {
				pending = true;
			}
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Could not enable notifications';
		} finally {
			busy = false;
		}
	}

	async function disable() {
		busy = true;
		errorMsg = '';
		try {
			await disableNotifications();
			notifyState = 'disabled';
			pending = false;
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Could not turn off notifications';
		} finally {
			busy = false;
		}
	}

	const perks = [
		'A reminder 24 hours before an event you’re going to or interested in',
		'A reminder 1 hour before it starts',
		'A nudge right when it starts',
		'A ping when someone RSVPs to an event you’re hosting'
	];
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="text-base-900 dark:text-base-50 mt-12 text-3xl font-bold sm:mt-20 sm:text-4xl">
		Settings
	</h1>

	<section class="mt-10">
		<div class="border-base-200 dark:border-base-800 rounded-2xl border p-6 sm:p-8">
			<h2 class="text-base-900 dark:text-base-50 text-xl font-bold">Notifications</h2>
			<p class="text-base-600 dark:text-base-300 mt-2 text-sm">
				Delivered through <a
					href="https://atmo.pub"
					target="_blank"
					rel="noreferrer"
					class="text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300 underline"
					>atmo.pub</a
				>, on the channels you choose there (web push, Telegram, …).
			</p>

			{#if !data.loggedIn}
				<p class="text-base-600 dark:text-base-300 mt-6 text-sm">
					Sign in to turn on notifications.
				</p>
				<div class="mt-4">
					<Button onclick={() => atProtoLoginModalState.show()}>Sign in</Button>
				</div>
			{:else if !data.configured}
				<p class="text-base-500 dark:text-base-400 mt-6 text-sm">
					Notifications aren’t available on this server yet.
				</p>
			{:else}
				<ul class="text-base-700 dark:text-base-300 mt-6 space-y-2 text-sm">
					{#each perks as perk (perk)}
						<li class="flex items-start gap-2">
							<span class="text-accent-500 mt-0.5">•</span>
							<span>{perk}</span>
						</li>
					{/each}
				</ul>

				{#if notifyState === 'enabled'}
					<div class="mt-7 flex flex-wrap items-center gap-4">
						<span
							class="inline-flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400"
						>
							<span class="size-2 rounded-full bg-green-500"></span>
							Notifications are on
						</span>
						<Button variant="ghost" onclick={disable} disabled={busy}>
							{busy ? 'Turning off…' : 'Turn off'}
						</Button>
					</div>
				{:else}
					<div class="mt-7">
						<Button onclick={enable} disabled={busy}>
							{busy ? 'Enabling…' : 'Enable notifications'}
						</Button>
					</div>

					{#if pending}
						<p
							class="border-accent-200 bg-accent-50 text-accent-800 dark:border-accent-900 dark:bg-accent-950 dark:text-accent-200 mt-4 rounded-lg border p-3 text-sm"
						>
							Almost there — approve atmo.rsvp on
							<a
								href="https://atmo.pub"
								target="_blank"
								rel="noreferrer"
								class="font-medium underline">atmo.pub</a
							> to start receiving notifications.
						</p>
					{/if}
				{/if}

				{#if errorMsg}
					<p class="mt-4 text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
				{/if}
			{/if}
		</div>
	</section>
</div>

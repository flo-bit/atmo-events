<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Button,
		NotificationSettings,
		NotificationPushToggle,
		type NotificationPreference,
		type NotificationPreferenceValue,
		type NotificationPushState
	} from '@atmo-dev/kit';
	import { notifications, setDevicePush, syncPush } from './client.svelte.js';

	let preferences = $state<NotificationPreference[]>([]);
	let channels = $state<string[]>([]);
	let push = $state<NotificationPushState>('off');
	let loaded = $state(false);
	let saving = $state(false);
	let error = $state('');
	let pushReady = $state(false);
	let pushError = $state('');
	async function preparePush() {
		pushError = '';
		try {
			push = await syncPush();
			pushReady = true;
		} catch {
			pushError = 'Could not set up push on this device.';
		}
	}
	async function load() {
		error = '';
		try {
			const result = await notifications.preferences();
			preferences = result.preferences;
			channels = result.channels;
			loaded = true;
			if (channels.includes('push')) void preparePush();
		} catch {
			error = 'Could not load notification settings.';
		}
	}
	onMount(() => {
		void load();
	});
	async function save(category: string, value: NotificationPreferenceValue) {
		saving = true;
		error = '';
		try {
			preferences = (await notifications.setPreference(category, value)).preferences;
		} catch {
			error = 'Could not save notification settings. Try again.';
		} finally {
			saving = false;
		}
	}
	async function toggle(enabled: boolean) {
		saving = true;
		error = '';
		try {
			push = await setDevicePush(enabled);
		} catch {
			error = 'Could not update push on this device. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="grid gap-4">
	{#if loaded}
		{#if channels.includes('push') && pushReady}
			<NotificationPushToggle
				class="justify-self-start"
				state={push}
				loading={saving}
				onenable={() => toggle(true)}
				ondisable={() => toggle(false)}
			/>
		{:else if channels.includes('push')}
			{#if pushError}
				<p role="alert" class="text-sm">{pushError}</p>
				<Button variant="secondary" onclick={preparePush} class="justify-self-start"
					>Retry push setup</Button
				>
			{:else}<p role="status" class="text-base-600 dark:text-base-400 text-sm">
					Preparing push…
				</p>{/if}
		{/if}
		<NotificationSettings
			{preferences}
			channels={channels.map((id) => ({ id, label: id === 'push' ? 'Push' : id }))}
			disabled={saving}
			onchange={save}
		/>
		<p class="text-base-600 dark:text-base-400 text-sm">
			Settings are private to this app. Turning a category off skips future notifications.
		</p>
	{:else if !error}<p role="status" class="text-base-600 dark:text-base-400 text-sm">
			Loading notifications…
		</p>{/if}
	{#if error}<p role="alert" class="text-sm">{error}</p>{/if}
	{#if !loaded && error}<Button variant="secondary" onclick={load} class="justify-self-start"
			>Try again</Button
		>{/if}
</div>

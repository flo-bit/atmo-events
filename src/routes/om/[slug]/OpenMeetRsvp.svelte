<script lang="ts">
	import { enhance } from '$app/forms';
	import { user } from '$lib/atproto/auth.svelte';
	import { Avatar, Button } from '@foxui/core';

	let {
		userRsvpStatus
	}: {
		userRsvpStatus: string | null;
	} = $props();

	let submitting = $state(false);
	let currentStatus: string | null = $state(null);
	$effect(() => { currentStatus = userRsvpStatus; });

	function statusLabel(status: string): string {
		switch (status) {
			case 'confirmed': return "You're Going";
			case 'pending': return 'RSVP Pending Approval';
			case 'waitlist': return "You're on the Waitlist";
			default: return `Status: ${status}`;
		}
	}

	function statusColor(status: string): string {
		switch (status) {
			case 'confirmed': return 'bg-green-100 dark:bg-green-900/30';
			case 'pending':
			case 'waitlist': return 'bg-amber-100 dark:bg-amber-900/30';
			default: return 'bg-base-100 dark:bg-base-900/30';
		}
	}

	function iconColor(status: string): string {
		switch (status) {
			case 'confirmed': return 'text-green-600 dark:text-green-400';
			case 'pending':
			case 'waitlist': return 'text-amber-600 dark:text-amber-400';
			default: return 'text-base-600 dark:text-base-400';
		}
	}
</script>

<div
	class="border-base-200 dark:border-base-800 bg-base-100 dark:bg-base-950/50 mt-8 mb-2 flex flex-col justify-center rounded-2xl border p-4"
>
	{#if currentStatus && currentStatus !== 'cancelled'}
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div
					class="flex size-8 items-center justify-center rounded-full {statusColor(currentStatus)}"
				>
					{#if currentStatus === 'confirmed'}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4 {iconColor(currentStatus)}">
							<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-4 {iconColor(currentStatus)}">
							<path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd" />
						</svg>
					{/if}
				</div>
				<p class="text-base-900 dark:text-base-50 font-semibold">{statusLabel(currentStatus)}</p>
			</div>
			<form
				method="POST"
				action="?/cancel"
				use:enhance={() => {
					submitting = true;
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'success') {
							currentStatus = null;
						}
					};
				}}
			>
				<Button type="submit" disabled={submitting} variant="ghost">
					{submitting ? '...' : 'Remove'}
				</Button>
			</form>
		</div>
	{:else}
		{#if user.profile}
			<div class="mb-4 flex items-center gap-2">
				<span class="text-base-500 dark:text-base-400 text-sm">Attend as</span>
				<Avatar
					src={user.profile.avatar}
					alt={user.profile.displayName || user.profile.handle}
					class="size-5"
				/>
				<span class="text-base-700 dark:text-base-300 truncate text-sm font-medium">
					{user.profile.displayName || user.profile.handle}
				</span>
			</div>
		{/if}
		<div class="flex gap-3">
			<form
				method="POST"
				action="?/attend"
				class="flex-1"
				use:enhance={() => {
					submitting = true;
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'success' && result.data) {
							currentStatus = (result.data as { status?: string }).status || 'confirmed';
						}
					};
				}}
			>
				<Button type="submit" disabled={submitting} class="w-full">
					{submitting ? '...' : 'Going'}
				</Button>
			</form>
		</div>
	{/if}
</div>

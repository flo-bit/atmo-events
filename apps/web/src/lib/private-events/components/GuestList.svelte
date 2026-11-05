<script lang="ts">
	import { Button, Input } from '@atmo-dev/kit';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { RsvpStatus } from '../ids';
	import { addGuest, removeGuest } from '../private-events.remote';

	type Guest = {
		did: string;
		handle: string | null;
		answer: RsvpStatus | null;
		answerUnread: boolean;
	};

	const ANSWER_WORDS: Record<RsvpStatus, string> = {
		going: 'Going',
		interested: 'Interested',
		notgoing: 'Not going'
	};

	let { rkey, guests }: { rkey: string; guests: Guest[] } = $props();

	let handle = $state('');
	let busy = $state(false);
	let failure: string | null = $state(null);
	let copied = $state(false);

	function answerWords(guest: Guest): string {
		if (guest.answer) return ANSWER_WORDS[guest.answer];
		return guest.answerUnread ? "Their answer couldn't be read" : "Added, hasn't answered";
	}

	function refusal(e: unknown): string {
		const message = (e as { body?: { message?: unknown } } | null)?.body?.message;
		return typeof message === 'string' ? message : 'That did not work. Try again.';
	}

	async function add(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		failure = null;
		try {
			await addGuest({ rkey, handleOrDid: handle });
			handle = '';
			await invalidateAll();
		} catch (e) {
			failure = refusal(e);
		} finally {
			busy = false;
		}
	}

	async function remove(did: string) {
		busy = true;
		failure = null;
		try {
			await removeGuest({ rkey, did });
			await invalidateAll();
		} catch (e) {
			failure = refusal(e);
		} finally {
			busy = false;
		}
	}

	async function copyLink() {
		await navigator.clipboard.writeText(page.url.origin + page.url.pathname);
		copied = true;
	}
</script>

<section class="mt-6" data-testid="guest-list">
	<h2 class="text-base-900 dark:text-base-50 text-sm font-semibold">Guests</h2>
	<p class="text-muted mt-1 text-sm">
		Only people you add can see this event. atmo doesn't tell them they were added, and nothing
		shows on their side until they open the link. The link is the invitation, so send it to them
		yourself.
	</p>
	<Button class="mt-2 w-full" size="sm" variant="secondary" onclick={copyLink}>
		{copied ? 'Link copied' : 'Copy the link'}
	</Button>
	<form class="mt-3 flex gap-2" onsubmit={add}>
		<Input
			name="guest-handle"
			aria-label="Guest's handle"
			placeholder="alice.bsky.social"
			autocomplete="off"
			bind:value={handle}
		/>
		<Button type="submit" size="sm" disabled={busy || handle.trim().length < 3}>Add</Button>
	</form>
	{#if failure}<p role="alert" class="mt-2 text-sm text-red-600">{failure}</p>{/if}
	{#if guests.length === 0}
		<p class="text-muted mt-3 text-sm">No guests yet.</p>
	{:else}
		<ul class="mt-3 space-y-2">
			{#each guests as guest (guest.did)}
				<li class="flex items-center justify-between gap-2 text-sm" data-guest={guest.did}>
					<span class="min-w-0">
						<span class="text-base-900 dark:text-base-50 block truncate font-medium"
							>{guest.handle ?? guest.did}</span
						>
						<span class="text-muted block text-xs">{answerWords(guest)}</span>
					</span>
					<Button size="sm" variant="ghost" disabled={busy} onclick={() => remove(guest.did)}
						>Remove</Button
					>
				</li>
			{/each}
		</ul>
	{/if}
</section>

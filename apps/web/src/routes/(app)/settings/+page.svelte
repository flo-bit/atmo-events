<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button, SocialClientPicker } from '@atmo-dev/kit';
	import { user, authorizePreferredSocialClient, logout } from '#lib/atproto/auth.svelte.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let saving = $state(false);
	let authorizing = $state(false);
	let authorizationError = $state('');
	async function authorize() {
		authorizing = true;
		authorizationError = '';
		try {
			await authorizePreferredSocialClient();
			// The helper returns without navigating if access is already granted.
			await invalidateAll();
		} catch {
			authorizationError = 'Could not authorize access. Try again.';
		} finally {
			authorizing = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-8 sm:py-12">
	<h1 class="mb-8 text-2xl font-semibold tracking-tight">Settings</h1>
	{#if !user.isLoggedIn}
		<p class="text-muted mb-4">Log in to choose your preferred social app.</p>
		<Button onclick={() => atProtoLoginModalState.show()}>Log in</Button>
	{:else if !data.canSaveClient}
		<section class="grid gap-4" aria-labelledby="social-client-heading">
			<h2 id="social-client-heading" class="font-semibold">Preferred social app</h2>
			<p class="text-muted text-sm">
				We need additional permission to save your preferred social app client.
			</p>
			<Button onclick={authorize} disabled={authorizing} class="justify-self-start">
				{authorizing ? 'Authorizing…' : 'Authorize now'}
			</Button>
			{#if authorizationError}<p role="alert" class="text-ink text-sm">{authorizationError}</p>{/if}
		</section>
	{:else if data.preferredClientLoadFailed}
		<p class="text-muted mb-4" role="alert">Could not load your social app selection.</p>
		<Button variant="secondary" onclick={() => invalidateAll()}>Try again</Button>
	{:else}
		<form
			class="grid gap-5"
			method="POST"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					try {
						await update({ reset: false });
					} finally {
						saving = false;
					}
				};
			}}
		>
			<SocialClientPicker value={data.preferredSocialClient} disabled={saving} />
			<p class="text-muted text-sm">Your selection is public and can be used by other apps.</p>
			<Button type="submit" disabled={saving} class="justify-self-start"
				>{saving ? 'Saving…' : 'Save'}</Button
			>
			{#if form?.message}<p role="alert" class="text-ink text-sm">{form.message}</p>
			{:else if form?.saved}<p role="status" class="text-muted text-sm">Saved.</p>{/if}
		</form>
	{/if}
	{#if user.isLoggedIn}
		<Button
			variant="secondary"
			onclick={() => logout()}
			disabled={saving || authorizing}
			class="mt-10">Sign out</Button
		>
	{/if}
</div>

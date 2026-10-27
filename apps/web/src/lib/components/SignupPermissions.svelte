<script lang="ts">
	import {
		Modal,
		Button,
		Checkbox,
		Icon,
		isPermissionSelected,
		resolveLoginOptions
	} from '@atmo-dev/kit';
	import { loginPermissions } from '#lib/atproto/settings.js';
	import { signup } from '#lib/atproto/auth.svelte.js';

	let { open = $bindable(false) }: { open: boolean } = $props();
	let choices = $state<Record<string, boolean>>({});
	let busy = $state(false);
	let error = $state('');
	const uid = $props.id();

	async function continueSignup() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await signup(resolveLoginOptions(loginPermissions, choices));
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Signup failed. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:open title="Requested permissions" dismissible={!busy}>
	<div class="space-y-5">
		{#each loginPermissions as permission (permission.id)}
			<div class="flex items-start gap-3">
				{#if permission.icon}
					<Icon
						img={permission.icon}
						size={20}
						class="text-base-500 dark:text-base-400 mt-1 shrink-0"
					/>
				{/if}
				<div class="min-w-0 flex-1">
					<label for={`${uid}-${permission.id}`} class="text-sm font-medium">
						{permission.label}{permission.required ? ' (required)' : ''}
					</label>
					<p class="text-base-500 dark:text-base-400 mt-1 text-sm">{permission.description}</p>
				</div>
				<Checkbox
					id={`${uid}-${permission.id}`}
					checked={isPermissionSelected(permission, choices)}
					disabled={permission.required || busy}
					onchange={(event) =>
						(choices = { ...choices, [permission.id]: event.currentTarget.checked })}
					class="mt-1"
				/>
			</div>
		{/each}
		{#if error}<p role="alert" class="text-sm">{error}</p>{/if}
		<Button class="w-full" disabled={busy} onclick={continueSignup}>
			{busy ? 'Continuing…' : 'Continue'}
		</Button>
	</div>
</Modal>

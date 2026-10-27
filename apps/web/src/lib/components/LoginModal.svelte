<script lang="ts" module>
	export const atProtoLoginModalState = $state({
		open: false,
		show() {
			this.open = true;
		},
		hide() {
			this.open = false;
		}
	});
</script>

<script lang="ts">
	import { login } from '#lib/atproto/auth.svelte.js';
	import SignupPermissions from './SignupPermissions.svelte';
	let signupOpen = $state(false);

	import { LoginDialog, createActorSearch } from '@atmo-dev/kit';
	import { loginPermissions } from '#lib/atproto/settings.js';
	const searchActors = createActorSearch();
</script>

<LoginDialog
	bind:open={atProtoLoginModalState.open}
	{searchActors}
	persistRecentAccounts
	permissions={loginPermissions}
	login={async (handle, _actor, options) => {
		await login(handle, options);
		return true;
	}}
	signup={() => {
		atProtoLoginModalState.hide();
		signupOpen = true;
		return false;
	}}
/>

{#if signupOpen}
	<SignupPermissions bind:open={signupOpen} />
{/if}

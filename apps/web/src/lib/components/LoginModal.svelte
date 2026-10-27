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
	import { login, signup } from '$lib/atproto';

	import { LoginDialog, createActorSearch } from '@atmo-dev/kit';
	const searchActors = createActorSearch();
</script>

<LoginDialog
	bind:open={atProtoLoginModalState.open}
	{searchActors}
	persistRecentAccounts
	login={async (handle) => {
		await login(handle);
		return true;
	}}
	signup={async () => {
		signup();
		return true;
	}}
/>

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
	import { login, signup } from '#lib/atproto/auth.svelte.js';
	import { LoginDialog, createActorSearch } from '@atmo-dev/kit';
	import { getLoginPermissions } from '#lib/atproto/settings.js';
	import { serviceUrl } from '#lib/atproto/network.js';
	import { page } from '$app/state';
	const searchActors = createActorSearch({ host: serviceUrl('appview') });
	let meetingLogin = $derived(page.url.pathname === '/tools/meet');
</script>

<LoginDialog
	bind:open={atProtoLoginModalState.open}
	{searchActors}
	persistRecentAccounts
	permissions={getLoginPermissions({ meetings: meetingLogin })}
	login={async (handle, _actor, options) => {
		await login(handle, { ...options, meetings: meetingLogin });
		return true;
	}}
	signup={() => signup({ meetings: meetingLogin })}
/>

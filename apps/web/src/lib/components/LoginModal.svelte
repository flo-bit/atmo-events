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

	import { AtprotoLoginModal } from '@foxui/social';
</script>

<AtprotoLoginModal
	bind:open={atProtoLoginModalState.open}
	login={async (handle) => {
		await login(handle);
		return true;
	}}
	signup={async () => {
		signup();
		return true;
	}}
/>

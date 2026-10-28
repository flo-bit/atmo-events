<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="mx-auto max-w-3xl px-6 py-12">
	<h1 class="text-ink text-2xl font-semibold">{page.status}</h1>
	<p class="text-muted mt-2">{page.error?.message ?? 'Something went wrong'}</p>
	<a href="/" class="text-action mt-6 inline-block underline">Back to home</a>
</div>

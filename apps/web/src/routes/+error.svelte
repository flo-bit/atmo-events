<script lang="ts">
	import { page } from '$app/state';
	import { asset, resolve } from '$app/paths';
	import { Button } from '@atmo-dev/kit';

	let notFound = $derived(page.status === 404);
	let serverError = $derived(page.status >= 500);
	let title = $derived(
		notFound
			? 'Lost in the atmosphere?'
			: serverError
				? 'A little turbulence.'
				: 'We couldn’t open this page.'
	);
	let message = $derived(
		page.error?.message &&
			page.error.message !== 'Not Found' &&
			page.error.message !== 'Internal Error'
			? page.error.message
			: notFound
				? 'This page may have moved, or the link might be out of date.'
				: serverError
					? 'Something went wrong on our side. Please try again in a moment.'
					: 'Something went wrong. Head home and try again.'
	);
</script>

<main class="bg-page text-ink flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
	<div
		class="relative order-last h-[48svh] min-h-72 shrink-0 overflow-hidden lg:order-first lg:h-auto lg:min-h-dvh"
	>
		<img
			src={asset('Astro.svg')}
			alt=""
			width="1080"
			height="1015"
			class="absolute inset-0 size-full object-contain object-bottom lg:object-cover"
		/>
	</div>
	<div class="flex flex-1 items-center justify-center px-6 pt-12 pb-6 lg:px-20 lg:py-16">
		<div class="w-full max-w-md text-center lg:text-left">
			<p class="text-action font-mono text-sm">{page.status}</p>
			<h1 class="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
			<p class="text-muted mt-4 leading-relaxed text-pretty wrap-anywhere">{message}</p>
			<div class="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
				<Button href={resolve('/(app)')}>Back to home</Button>
				{#if serverError}
					<Button variant="secondary" onclick={() => window.location.reload()}>Try again</Button>
				{/if}
			</div>
		</div>
	</div>
</main>

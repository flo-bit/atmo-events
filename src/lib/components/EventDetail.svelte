<script lang="ts">
	import type { Snippet } from 'svelte';
	import Avatar from 'svelte-boring-avatars';
	import { formatMonth, formatDay, formatWeekday, formatFullDate, formatTime } from '$lib/cal/helper';

	let {
		name,
		image = null,
		imageAlt = undefined,
		avatarSeed,
		showImage = true,
		startsAt,
		endsAt = null,
		descriptionHtml = null,
		location = null,
		banner,
		imageExtra,
		badges,
		rsvp,
		sidebar,
		aboveDescription,
		belowDescription
	}: {
		name: string;
		image?: string | null;
		imageAlt?: string;
		avatarSeed: string;
		showImage?: boolean;
		startsAt: Date;
		endsAt?: Date | null;
		descriptionHtml?: string | null;
		location?: { text: string; secondaryText?: string; mapsUrl: string } | null;
		banner?: Snippet;
		imageExtra?: Snippet;
		badges?: Snippet;
		rsvp?: Snippet;
		sidebar?: Snippet;
		aboveDescription?: Snippet;
		belowDescription?: Snippet;
	} = $props();

	let isSameDay = $derived(
		endsAt &&
			startsAt.getFullYear() === endsAt.getFullYear() &&
			startsAt.getMonth() === endsAt.getMonth() &&
			startsAt.getDate() === endsAt.getDate()
	);
</script>

<div class="min-h-screen px-6 py-12 sm:py-12">
	<div class="mx-auto max-w-3xl">
		{#if banner}
			{@render banner()}
		{/if}

		<div
			class="grid grid-cols-1 gap-8 md:grid-cols-[14rem_1fr] md:grid-rows-[auto_1fr] md:gap-x-10 md:gap-y-6 lg:grid-cols-[16rem_1fr]"
		>
			<!-- Left column: image -->
			{#if showImage}
				<div class="order-1 max-w-sm md:order-0 md:col-start-1 md:max-w-none">
					{#if image}
						<img
							src={image}
							alt={imageAlt || name}
							class="border-base-200 dark:border-base-800 bg-base-200 dark:bg-base-950/50 aspect-square w-full rounded-2xl border object-cover"
						/>
					{:else}
						<div
							class="border-base-200 dark:border-base-800 aspect-square w-full overflow-hidden rounded-2xl border [&>svg]:h-full [&>svg]:w-full"
						>
							<Avatar
								size={256}
								name={avatarSeed}
								variant="marble"
								colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
								square
							/>
						</div>
					{/if}
					{#if imageExtra}
						{@render imageExtra()}
					{/if}
				</div>
			{/if}

			<!-- Right column: event details -->
			<div class="order-2 min-w-0 md:order-0 md:col-start-2 md:row-span-2 md:row-start-1">
				<div class="mb-2">
					<h1
						class="text-base-900 dark:text-base-50 text-3xl leading-tight font-bold sm:text-4xl"
					>
						{name}
					</h1>
				</div>

				{#if badges}
					<div class="mb-8 flex items-center gap-2">
						{@render badges()}
					</div>
				{/if}

				<!-- Date row -->
				<div class="mb-4 flex items-center gap-4">
					<div
						class="border-base-200 dark:border-base-700 bg-base-100 dark:bg-base-950/30 flex size-12 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border"
					>
						<span
							class="text-base-500 dark:text-base-400 text-[9px] leading-none font-semibold"
						>
							{formatMonth(startsAt)}
						</span>
						<span class="text-base-900 dark:text-base-50 text-lg leading-tight font-bold">
							{formatDay(startsAt)}
						</span>
					</div>
					<div>
						<p class="text-base-900 dark:text-base-50 font-semibold">
							{formatWeekday(startsAt)}, {formatFullDate(startsAt)}
							{#if endsAt && !isSameDay}
								- {formatWeekday(endsAt)}, {formatFullDate(endsAt)}
							{/if}
						</p>
						<p class="text-base-500 dark:text-base-400 text-sm">
							{formatTime(startsAt)}
							{#if endsAt && isSameDay}
								- {formatTime(endsAt)}
							{/if}
						</p>
					</div>
				</div>

				<!-- Location -->
				{#if location}
					<a
						href={location.mapsUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="mb-6 flex items-center gap-4 transition-opacity hover:opacity-80"
					>
						<div
							class="border-base-200 dark:border-base-700 bg-base-100 dark:bg-base-950/30 flex size-12 shrink-0 items-center justify-center rounded-xl border"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="text-base-900 dark:text-base-200 size-5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
								/>
							</svg>
						</div>
						<div>
							<p class="text-base-900 dark:text-base-50 font-semibold">{location.text}</p>
							{#if location.secondaryText}
								<p class="text-base-500 dark:text-base-400 text-sm">
									{location.secondaryText}
								</p>
							{/if}
						</div>
					</a>
				{/if}

				{#if aboveDescription}
					{@render aboveDescription()}
				{/if}

				{#if rsvp}
					{@render rsvp()}
				{/if}

				{#if descriptionHtml}
					<div class="mt-8 mb-8">
						<p
							class="text-base-500 dark:text-base-400 mb-3 text-xs font-semibold tracking-wider uppercase"
						>
							About
						</p>
						<div
							class="text-base-700 dark:text-base-300 prose dark:prose-invert prose-a:text-accent-600 dark:prose-a:text-accent-400 prose-a:hover:underline prose-a:no-underline max-w-none leading-relaxed wrap-break-word"
						>
							{@html descriptionHtml}
						</div>
					</div>
				{/if}

				{#if belowDescription}
					{@render belowDescription()}
				{/if}
			</div>

			<!-- Left column: sidebar -->
			<div class="order-3 space-y-6 md:order-0 md:col-start-1">
				{#if sidebar}
					{@render sidebar()}
				{/if}
			</div>
		</div>
	</div>
</div>

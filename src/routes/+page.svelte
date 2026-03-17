<script lang="ts">
	let { data } = $props();

	function formatDate(dateStr: string | undefined): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function modeLabel(mode: string | undefined): string | undefined {
		if (!mode) return undefined;
		if (mode.endsWith('#inperson')) return 'In-Person';
		if (mode.endsWith('#virtual')) return 'Virtual';
		if (mode.endsWith('#hybrid')) return 'Hybrid';
		return undefined;
	}

	function isCancelled(status: string | undefined): boolean {
		return !!status && status.endsWith('#cancelled');
	}

	function truncate(text: string | undefined, max = 140): string {
		if (!text) return '';
		if (text.length <= max) return text;
		return text.slice(0, max).trimEnd() + '...';
	}

	const profileMap = $derived(
		Object.fromEntries(data.profiles.map((p) => [p.did, p]))
	);

	function avatarUrl(did: string): string | undefined {
		const profile = profileMap[did];
		const avatar = profile?.record?.avatar;
		if (!avatar || !('ref' in avatar)) return undefined;
		const ref = (avatar as { ref: { $link: string } }).ref.$link;
		return `https://cdn.bsky.app/img/avatar/plain/${did}/${ref}@jpeg`;
	}

	function goingAvatarDids(event: (typeof data.events)[number]): string[] {
		const going = event.rsvps?.going;
		if (!going) return [];
		return going.map((r) => r.did).filter((did) => avatarUrl(did));
	}
</script>

<div class="mx-auto max-w-3xl px-4 py-12">
	<h1 class="text-base-900 dark:text-base-50 mb-8 text-3xl font-bold">Upcoming Events</h1>

	{#if data.events.length === 0}
		<p class="text-base-500 text-center text-lg">No upcoming events found.</p>
	{:else}
		<div class="flex flex-col gap-4">
			{#each data.events as event (event.uri)}
				{@const record = event.record}
				{#if record}
					<a
						href="/{event.did}/e/{event.rkey}"
						target="_blank"
						rel="noopener noreferrer"
						class="bg-base-100 dark:bg-base-950/50 inset-shadow-sm dark:inset-shadow-black/10 border-base-300 dark:border-base-800 block rounded-2xl border p-5"
						class:opacity-60={isCancelled(record.status)}
					>
						<div class="mb-2 flex items-start justify-between gap-3">
							<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">
								{record.name}
							</h2>
							<div class="flex shrink-0 items-center gap-2">
								{#if isCancelled(record.status)}
									<span
										class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
									>
										Cancelled
									</span>
								{/if}
								{#if modeLabel(record.mode)}
									<span
										class="bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300 rounded-full px-2.5 py-0.5 text-xs font-medium"
									>
										{modeLabel(record.mode)}
									</span>
								{/if}
							</div>
						</div>

						{#if record.startsAt}
							<p class="text-accent-600 dark:text-accent-400 mb-2 text-sm font-medium">
								{formatDate(record.startsAt)}
								{#if record.endsAt}
									<span class="text-base-400 mx-1">&mdash;</span>
									{formatDate(record.endsAt)}
								{/if}
							</p>
						{/if}

						{#if (event.rsvpsGoingCount ?? 0) > 0 || (event.rsvpsInterestedCount ?? 0) > 0}
							<p class="text-base-500 dark:text-base-400 mb-2 text-sm">
								{#if (event.rsvpsGoingCount ?? 0) > 0}
									<span class="text-accent-600 dark:text-accent-400 font-medium">{event.rsvpsGoingCount}</span> going
								{/if}
								{#if (event.rsvpsGoingCount ?? 0) > 0 && (event.rsvpsInterestedCount ?? 0) > 0}
									<span class="mx-1">&middot;</span>
								{/if}
								{#if (event.rsvpsInterestedCount ?? 0) > 0}
									<span class="text-accent-600 dark:text-accent-400 font-medium">{event.rsvpsInterestedCount}</span> interested
								{/if}
							</p>
						{/if}

						{#if goingAvatarDids(event).length > 0}
							{@const dids = goingAvatarDids(event)}
							<div class="mb-2 flex items-center gap-1">
								{#each dids as did (did)}
									<img
										src={avatarUrl(did)}
										alt=""
										class="border-base-200 dark:border-base-700 h-7 w-7 rounded-full border object-cover"
									/>
								{/each}
								<span class="text-base-400 ml-1 text-xs">going</span>
							</div>
						{/if}

						{#if record.description}
							<p class="text-base-600 dark:text-base-400 text-sm leading-relaxed">
								{truncate(record.description)}
							</p>
						{/if}
					</a>
				{/if}
			{/each}
		</div>
	{/if}
</div>

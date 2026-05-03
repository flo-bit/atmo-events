<script lang="ts">
	import type { ActivityCluster } from '$lib/contrail';
	import { eventUrl } from '$lib/contrail';
	import type { AttendeeInfo } from '$lib/contrail';

	let { activities }: { activities: ActivityCluster[] } = $props();

	function visibleAttendees(cluster: ActivityCluster): {
		shown: AttendeeInfo[];
		status: 'going' | 'interested';
	} {
		const going = cluster.attendees.filter((a) => a.status === 'going');
		if (going.length > 0) return { shown: going, status: 'going' };
		return { shown: cluster.attendees, status: 'interested' };
	}

	function namesSentence(attendees: AttendeeInfo[]): string {
		const names = attendees.map((a) => a.name);
		if (names.length === 0) return '';
		if (names.length === 1) return names[0];
		if (names.length === 2) return `${names[0]} and ${names[1]}`;
		const others = names.length - 2;
		return `${names[0]}, ${names[1]}, and ${others} other${others === 1 ? '' : 's'}`;
	}

	function verb(count: number, status: 'going' | 'interested'): string {
		const plural = count > 1;
		if (status === 'going') return plural ? 'are going' : 'is going';
		return plural ? 'are interested' : 'is interested';
	}

	function relativeTime(timeMs: number): string {
		const ageMs = Date.now() - timeMs;
		const sec = Math.max(0, Math.floor(ageMs / 1000));
		if (sec < 60) return 'just now';
		const mins = Math.floor(sec / 60);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		const weeks = Math.floor(days / 7);
		return `${weeks}w ago`;
	}

	function initial(name: string): string {
		const trimmed = name.trim();
		if (!trimmed) return '?';
		return trimmed.slice(0, 1).toUpperCase();
	}
</script>

<ul class="divide-base-200 dark:divide-base-800 divide-y">
	{#each activities as cluster (cluster.event.uri)}
		{@const { shown, status } = visibleAttendees(cluster)}
		{@const eventTitle = cluster.event.name || 'Untitled event'}
		<li>
			<a
				href={eventUrl(cluster.event)}
				class="hover:bg-base-100 dark:hover:bg-base-900/50 -mx-2 block rounded-lg px-2 py-3 transition-colors"
			>
				<div class="flex items-baseline justify-between gap-2">
					<h3
						class="text-base-900 dark:text-base-50 min-w-0 truncate text-base font-semibold"
					>
						{eventTitle}
					</h3>
					<span class="text-base-500 shrink-0 text-xs">
						{relativeTime(cluster.latestCreatedAtMs)}
					</span>
				</div>
				<div class="mt-2 flex items-center gap-2">
					<div class="flex shrink-0 -space-x-1.5">
						{#if shown.length >= 4}
							{#each shown.slice(0, 2) as attendee (attendee.did)}
								{#if attendee.avatar}
									<img
										src={attendee.avatar}
										alt=""
										class="ring-base-50 dark:ring-base-900 h-6 w-6 rounded-full object-cover ring-2"
									/>
								{:else}
									<div
										class="bg-base-300 dark:bg-base-700 text-base-700 dark:text-base-200 ring-base-50 dark:ring-base-900 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ring-2"
									>
										{initial(attendee.name)}
									</div>
								{/if}
							{/each}
							<span
								class="bg-base-200 dark:bg-base-800 text-base-700 dark:text-base-200 ring-base-50 dark:ring-base-900 inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2"
							>
								+{shown.length - 2}
							</span>
						{:else}
							{#each shown as attendee (attendee.did)}
								{#if attendee.avatar}
									<img
										src={attendee.avatar}
										alt=""
										class="ring-base-50 dark:ring-base-900 h-6 w-6 rounded-full object-cover ring-2"
									/>
								{:else}
									<div
										class="bg-base-300 dark:bg-base-700 text-base-700 dark:text-base-200 ring-base-50 dark:ring-base-900 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ring-2"
									>
										{initial(attendee.name)}
									</div>
								{/if}
							{/each}
						{/if}
					</div>
					<p class="text-base-600 dark:text-base-400 min-w-0 truncate text-sm">
						<span class="text-base-800 dark:text-base-200">{namesSentence(shown)}</span>
						{verb(shown.length, status)}
					</p>
				</div>
			</a>
		</li>
	{/each}
</ul>

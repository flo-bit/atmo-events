<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import Avatar from 'svelte-boring-avatars';
	import { notifyContrailOfUpdate } from '$lib/contrail';

	let { data } = $props();

	let rsvpStatus: 'going' | 'interested' | 'notgoing' | null = $state(untrack(() => data.viewerRsvpStatus));
	let rsvpRkey: string | null = $state(untrack(() => data.viewerRsvpRkey));
	let submitting = $state(false);

	onMount(() => {
		if (!window.Blento) return;
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		(async () => {
			try {
				await window.Blento!.ready;
			} catch {
				return;
			}
			if (cancelled) return;
			unsubscribe = window.Blento!.on('session', (s) => {
				if (s && !data.viewerDid) {
					const url = new URL(window.location.href);
					url.searchParams.set('did', s.did);
					window.location.href = url.toString();
				}
			});
		})();
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	});

	function handleLogin() {
		window.Blento?.promptLogin();
	}

	let eventUrl = $derived(`https://atmo.rsvp/p/${data.actorDid}/e/${data.rkey}`);

	let startDate = $derived(new Date(data.eventData.startsAt));
	let endDate = $derived(data.eventData.endsAt ? new Date(data.eventData.endsAt) : null);

	function formatDate(date: Date): string {
		const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
		if (date.getFullYear() !== new Date().getFullYear()) {
			options.year = 'numeric';
		}
		return date.toLocaleDateString('en-US', options);
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function getLocationString(): string | null {
		const locations = data.eventData.locations;
		if (!locations || locations.length === 0) return null;
		const loc = locations.find((v) => v.$type === 'community.lexicon.location.address') as
			| { name?: string; street?: string; locality?: string; region?: string }
			| undefined;
		if (!loc) return null;
		if (loc.name) return loc.name;
		const parts = [loc.locality, loc.region].filter(Boolean);
		return parts.length > 0 ? parts.join(', ') : null;
	}

	let location = $derived(getLocationString());

	let isSameDay = $derived(
		endDate &&
		startDate.getFullYear() === endDate.getFullYear() &&
		startDate.getMonth() === endDate.getMonth() &&
		startDate.getDate() === endDate.getDate()
	);


	async function submitRsvp(status: 'going' | 'interested') {
		if (!window.Blento || !data.viewerDid) return;
		submitting = true;
		try {
			await window.Blento.ready;
			const result = await window.Blento.createRecord({
				collection: 'community.lexicon.calendar.rsvp',
				record: {
					$type: 'community.lexicon.calendar.rsvp',
					createdWith: 'https://atmo.rsvp',
					status: `community.lexicon.calendar.rsvp#${status}`,
					subject: {
						uri: data.eventUri,
						...(data.eventCid ? { cid: data.eventCid } : {})
					},
					createdAt: new Date().toISOString()
				}
			});
			rsvpStatus = status;
			if (result?.uri) {
				const parts = result.uri.split('/');
				rsvpRkey = parts[parts.length - 1];
				notifyContrailOfUpdate(result.uri);
			}
		} catch (e) {
			console.error('RSVP failed:', e);
		} finally {
			submitting = false;
		}
	}

	async function cancelRsvp() {
		if (!window.Blento || !rsvpRkey || !data.viewerDid) return;
		submitting = true;
		const rsvpUri = `at://${data.viewerDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`;
		try {
			await window.Blento.ready;
			await window.Blento.deleteRecord({
				collection: 'community.lexicon.calendar.rsvp',
				rkey: rsvpRkey
			});
			notifyContrailOfUpdate(rsvpUri);
			rsvpStatus = null;
			rsvpRkey = null;
		} catch (e) {
			console.error('Cancel RSVP failed:', e);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<!-- Apply theme classes before paint to avoid flash -->
	<script>
		var p = new URLSearchParams(location.search);
		var h = document.documentElement;
		var bases = ['gray','zinc','neutral','stone','slate','mist','olive','mauve','taupe'];
		var accents = ['red','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose'];
		var b = p.get('base');
		if (b) { bases.forEach(function (c) { h.classList.remove(c); }); h.classList.add(b); }
		var a = p.get('accent');
		if (a) { accents.forEach(function (c) { h.classList.remove(c); }); h.classList.add(a); }
		if (p.get('dark') === '1') h.classList.add('dark');
	</script>
	<script src="https://blento.app/embed/v0/sdk.js"></script>
</svelte:head>

<div class="embed-root bg-base-200 dark:bg-base-950/50 text-base-900 dark:text-base-50">
	<div class="embed-frame">
		<a href={eventUrl} target="_blank" rel="noopener noreferrer" class="embed-thumb">
			{#if data.thumbnailUrl}
				<img
					src={data.thumbnailUrl}
					alt={data.eventData.name}
					class="size-full object-cover"
				/>
			{:else}
				<div class="size-full [&>svg]:size-full">
					<Avatar
						size={200}
						name={data.rkey}
						variant="marble"
						colors={['#92A1C6', '#146A7C', '#F0AB3D', '#C271B4', '#C20D90']}
						square
					/>
				</div>
			{/if}
		</a>

		<div class="embed-info">
			<a href={eventUrl} target="_blank" rel="noopener noreferrer" class="embed-meta">
				<h2 class="embed-title">{data.eventData.name}</h2>
				<p class="embed-line text-base-500 dark:text-base-400">
					{formatDate(startDate)}, {formatTime(startDate)}{#if endDate && isSameDay} - {formatTime(endDate)}{/if}
				</p>
				{#if location}
					<p class="embed-line text-base-500 dark:text-base-400">{location}</p>
				{/if}
			</a>

			{#if !data.viewerDid}
				<div class="embed-rsvp-wrap">
					<button
						onclick={handleLogin}
						class="embed-btn embed-btn-primary bg-accent-600 hover:bg-accent-700 text-white"
					>Log in to RSVP</button>
				</div>
			{:else}
				<div class="embed-rsvp-card border-base-300 dark:border-base-800 bg-base-100 dark:bg-base-900/50">
					{#if rsvpStatus === 'going'}
						<div class="embed-status-row">
							<div class="embed-status-left">
								<div class="embed-status-icon bg-green-100 dark:bg-green-900/30">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="text-green-600 dark:text-green-400">
										<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
									</svg>
								</div>
								<span class="embed-status-label text-base-900 dark:text-base-50">You're Going</span>
							</div>
							<button onclick={cancelRsvp} disabled={submitting} aria-label="Cancel RSVP" class="embed-cancel text-base-400 hover:text-base-600 dark:text-base-500 dark:hover:text-base-300">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
									<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
								</svg>
							</button>
						</div>
					{:else if rsvpStatus === 'interested'}
						<div class="embed-status-row">
							<div class="embed-status-left">
								<div class="embed-status-icon bg-amber-100 dark:bg-amber-900/30">
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="text-amber-600 dark:text-amber-400">
										<path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clip-rule="evenodd" />
									</svg>
								</div>
								<span class="embed-status-label text-base-900 dark:text-base-50">You're Interested</span>
							</div>
							<button onclick={cancelRsvp} disabled={submitting} aria-label="Cancel RSVP" class="embed-cancel text-base-400 hover:text-base-600 dark:text-base-500 dark:hover:text-base-300">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
									<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
								</svg>
							</button>
						</div>
					{:else}
						<div class="embed-btn-row">
							<button
								onclick={() => submitRsvp('going')}
								disabled={submitting}
								class="embed-btn embed-btn-primary bg-accent-600 hover:bg-accent-700 text-white"
							>Going</button>
							<button
								onclick={() => submitRsvp('interested')}
								disabled={submitting}
								class="embed-btn embed-btn-secondary bg-base-300 dark:bg-base-800 hover:bg-base-400 dark:hover:bg-base-700 text-base-700 dark:text-base-300"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="embed-btn-icon">
									<path fill-rule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clip-rule="evenodd" />
								</svg>
								<span class="embed-btn-text">Interested</span>
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.embed-root {
		container-type: size;
		container-name: embed;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.embed-frame {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: clamp(0.75rem, 4cqmin, 1.75rem);
		padding: clamp(0.625rem, 3cqmin, 1.5rem);
		width: 100%;
		height: 100%;
		box-sizing: border-box;
	}

	@container embed (aspect-ratio > 3) {
		.embed-frame {
			max-width: 36rem;
		}
	}

	.embed-thumb {
		display: block;
		flex-shrink: 0;
		aspect-ratio: 1;
		overflow: hidden;
		border-radius: clamp(0.5rem, 2cqmin, 1rem);
		width: min(80cqb, 36cqi);
		max-width: 9rem;
		min-width: 2.5rem;
	}

	.embed-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: clamp(0.5rem, 2cqmin, 0.75rem);
	}

	.embed-meta {
		display: block;
		min-width: 0;
	}

	.embed-title {
		font-size: clamp(0.8125rem, 4cqmin, 1.125rem);
		line-height: 1.25;
		font-weight: 600;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.embed-line {
		font-size: clamp(0.6875rem, 2.8cqmin, 0.875rem);
		margin-top: 0.2em;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}

	.embed-rsvp-wrap {
		display: block;
	}

	.embed-rsvp-card {
		border-width: 1px;
		border-style: solid;
		border-radius: clamp(0.5rem, 2.5cqmin, 1rem);
		padding: clamp(0.5rem, 2cqmin, 0.875rem);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.embed-btn-row {
		display: flex;
		gap: clamp(0.375rem, 1.5cqmin, 0.5rem);
	}

	.embed-btn {
		flex: 1;
		font-size: clamp(0.6875rem, 2.8cqmin, 1rem);
		padding: clamp(0.25rem, 1.2cqmin, 0.5rem) clamp(0.625rem, 2.5cqmin, 1.25rem);
		border-radius: clamp(0.375rem, 1.6cqmin, 0.625rem);
		font-weight: 500;
		cursor: pointer;
		transition: background-color 150ms;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
	}

	.embed-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.embed-btn-icon {
		display: none;
		width: clamp(0.875rem, 3.2cqmin, 1.125rem);
		height: clamp(0.875rem, 3.2cqmin, 1.125rem);
	}

	.embed-btn-text {
		display: inline-block;
	}

	@container embed (max-width: 360px) {
		.embed-btn-text {
			display: none;
		}
		.embed-btn-icon {
			display: inline-block;
		}
	}

	.embed-status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: clamp(0.5rem, 2cqmin, 0.75rem);
		min-width: 0;
	}

	.embed-status-left {
		display: flex;
		align-items: center;
		gap: clamp(0.375rem, 1.5cqmin, 0.625rem);
		min-width: 0;
		flex: 1;
	}

	.embed-status-icon {
		flex-shrink: 0;
		width: clamp(1.25rem, 4.5cqmin, 1.75rem);
		height: clamp(1.25rem, 4.5cqmin, 1.75rem);
		border-radius: 9999px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.embed-status-icon svg {
		width: 60%;
		height: 60%;
	}

	.embed-status-label {
		font-size: clamp(0.6875rem, 2.8cqmin, 0.875rem);
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		min-width: 0;
	}

	.embed-cancel {
		flex-shrink: 0;
		cursor: pointer;
		transition: color 150ms;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 0;
		padding: 0.125rem;
	}

	.embed-cancel svg {
		width: clamp(0.875rem, 3.2cqmin, 1.125rem);
		height: clamp(0.875rem, 3.2cqmin, 1.125rem);
	}

	@container embed (aspect-ratio < 1.3) {
		.embed-frame {
			flex-direction: column;
			justify-content: center;
			max-width: 28rem;
			max-height: 100%;
		}
		.embed-thumb {
			width: min(45cqb, 65cqi);
			max-width: 18rem;
		}
		.embed-info {
			width: 100%;
			flex: 0 1 auto;
		}
		.embed-meta {
			text-align: center;
		}
	}
</style>

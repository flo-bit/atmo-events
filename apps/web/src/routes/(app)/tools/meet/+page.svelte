<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { isHandle } from '@atcute/lexicons/syntax';
	import {
		ActorSearchField,
		Button,
		Icon,
		Modal,
		Tabs,
		createActorSearch,
		type ActorSearch
	} from '@atmo-dev/kit';
	import { ScanQrCode } from '@sketchyicons/svelte';
	import { user, authorizeMeetings } from '#lib/atproto/auth.svelte.js';
	import { serviceUrl } from '#lib/atproto/network.js';
	import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
	import QrCode from '#lib/meet/QrCode.svelte';
	import QrScanner from '#lib/meet/QrScanner.svelte';
	import Person from '#lib/meet/Person.svelte';
	import { meetingsFor, parseMeetingCode, type Connection } from '#lib/meet/connection.js';
	import { watchConnections } from '#lib/meet/jetstream.js';
	import { onDestroy, untrack } from 'svelte';
	import { reconcileConnectionOverlay, type ConnectionOverlay } from '#lib/meet/history.js';
	import { createMeetingQueue } from '#lib/meet/queue.svelte.js';
	import { resolveMeetingActor } from '#lib/meet/resolve.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let live = $state<ConnectionOverlay>({});
	let dismissed = $state<string[]>([]);
	let tab = $state('meet');
	let closedTarget = $state<string | null>(null);
	let notice = $state<{ message: string } | null>(
		untrack(() =>
			form?.saved
				? { message: form.alreadyMet ? 'You already saved this meeting.' : 'Meeting saved.' }
				: null
		)
	);
	let scanning = $state(false);
	let lookup = $state('');
	let opening = $state(false);
	let error = $state('');
	let authorizing = $state(false);
	let saving = $state(false);
	let copied = $state(false);

	// Keep the subscription/live overlay across load invalidations for the same account.
	let viewerDid = $derived(user.did);
	const queue = createMeetingQueue({
		resolve: resolveMeetingActor,
		viewer: () => viewerDid,
		incomingUri,
		onError: (message) => {
			error = message;
		}
	});
	onDestroy(() => queue.clear());
	let queueAccount = untrack(() => viewerDid);
	let shareActor = $derived(
		user.profile?.handle && isHandle(user.profile.handle) ? user.profile.handle : (viewerDid ?? '')
	);
	let shareUrl = $derived(
		`${page.url.origin}${resolve(`/(app)/tools/meet?${isHandle(shareActor) ? 'actor' : 'did'}=${encodeURIComponent(shareActor)}`)}`
	);
	let connectionRecords = $derived.by(() => {
		const records: Record<string, Connection> = Object.fromEntries(
			data.connections.map((record) => [record.uri, record])
		);
		for (const [uri, { connection }] of Object.entries(live)) {
			if (connection) records[uri] = connection;
			else delete records[uri];
		}
		return Object.values(records);
	});
	let connections = $derived(meetingsFor(viewerDid ?? '', connectionRecords));
	let pending = $derived(
		connections.filter(
			(c) =>
				c.incoming &&
				!c.outgoing &&
				!dismissed.includes(c.did) &&
				!queue.people.some((person) => person.did === c.did)
		)
	);
	let met = $derived(connections.filter((c) => c.outgoing));
	let selectedTarget = $derived(queue.people[0] ?? null);
	let targetMeeting = $derived(connections.find((c) => c.did === selectedTarget?.did));
	let completedTarget = $derived(
		!saving && targetMeeting?.outgoing ? selectedTarget?.did : undefined
	);
	let feedback = $derived(
		error ||
			form?.message ||
			notice?.message ||
			(data.selfScan ? 'That’s your own account. Ask someone to scan your code.' : '')
	);

	function closeTarget() {
		const person = selectedTarget;
		if (!person) return;
		queue.remove(person.did);
		dismissed = [...dismissed, person.did];
		form = null;
		if (person.fromLink && data.target?.did === person.did)
			void goto(resolve('/(app)/tools/meet'), { replace: true, reset: false }).catch(() => {});
	}
	function loginForTarget() {
		// Keep the scanned link in the OAuth return URL.
		if (selectedTarget) queue.remove(selectedTarget.did);
		atProtoLoginModalState.show();
	}

	$effect(() => {
		const target = data.target;
		if (!target) {
			closedTarget = null;
			return;
		}
		if (closedTarget === target.did) return;
		closedTarget = target.did;
		untrack(() => queue.include({ ...target, fromLink: true }));
	});
	$effect(() => {
		const targetDid = completedTarget;
		if (!targetDid) return;
		const timer = setTimeout(() => {
			if (selectedTarget?.did === targetDid) closeTarget();
		}, 3000);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		if (!notice) return;
		const timer = setTimeout(() => {
			notice = null;
		}, 3000);
		return () => clearTimeout(timer);
	});

	const accountSearch = createActorSearch({ host: serviceUrl('appview') });
	const searchActors: ActorSearch = (query, signal) => {
		// Links and DIDs remain valid input, but must never be sent to account search.
		return /[:/?#]/.test(query) ? Promise.resolve([]) : accountSearch(query, signal);
	};
	function incomingUri(owner: string) {
		return connectionRecords.find((r) => r.owner === owner && r.subject === viewerDid)?.uri ?? '';
	}
	function meetingDate(value: string) {
		return Number.isFinite(Date.parse(value))
			? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
					new Date(value)
				)
			: '';
	}

	async function refreshMeetings(refresh: () => Promise<unknown> = invalidateAll) {
		const beforeRefresh = live;
		const did = viewerDid;
		await refresh();
		// A refresh started by the previous account must not touch this account's overlay.
		if (did && did === viewerDid) {
			live = reconcileConnectionOverlay(live, beforeRefresh, did, data);
		}
	}

	$effect(() => {
		if (tab !== 'meet') scanning = false;
	});
	$effect(() => {
		const did = viewerDid;
		live = {};
		dismissed = [];
		if (queueAccount !== did) {
			untrack(() => queue.clear());
			closedTarget = null;
			queueAccount = did;
			scanning = false;
		}
		if (!did) return;
		return watchConnections({
			onReconnect: () => {
				void refreshMeetings().catch(() => {});
			},
			onChange: ({ uri, connection }) => {
				const relevant = connection && (connection.owner === did || connection.subject === did);
				const known = uri in live || data.connections.some((r) => r.uri === uri);
				if (
					connection?.subject === did &&
					connection.owner !== did &&
					!known &&
					data.canMeet &&
					!dismissed.includes(connection.owner) &&
					!connections.some((c) => c.did === connection.owner && c.outgoing)
				) {
					queue.include({ did: connection.owner, incomingUri: uri });
				}
				if (relevant || known) {
					live = { ...live, [uri]: { connection: relevant ? connection : null } };
				}
			}
		});
	});

	const saveMeeting: SubmitFunction = () => {
		saving = true;
		error = '';
		return async ({ result, update }) => {
			let confirmedDid: string | undefined;
			try {
				if (result.type === 'success' && result.data?.saved) {
					const saved = result.data.saved as Connection;
					notice = {
						message: result.data.alreadyMet ? 'You already saved this meeting.' : 'Meeting saved.'
					};
					live = { ...live, [saved.uri]: { connection: saved } };
					confirmedDid = saved.subject;
				}
				await refreshMeetings(() => update({ reset: false }));
			} catch {
				error = 'Could not refresh meetings. Reload to check the saved record.';
			} finally {
				saving = false;
				if (confirmedDid && selectedTarget?.did === confirmedDid) closeTarget();
			}
		};
	};
	async function authorize() {
		authorizing = true;
		error = '';
		try {
			await authorizeMeetings();
			await refreshMeetings();
		} catch {
			error = 'Could not authorize meetings. Try again.';
		} finally {
			authorizing = false;
		}
	}
	function codeActor(value: string) {
		error = '';
		const actor = parseMeetingCode(value, page.url.origin);
		if (!actor) {
			error = 'Enter a valid handle, meeting link, or DID.';
			return null;
		}
		if (actor === viewerDid || actor === user.profile?.handle) {
			error = 'That’s your own account.';
			return null;
		}
		return actor;
	}
	function scanCode(value: string) {
		const actor = codeActor(value);
		if (actor) void queue.add(actor);
	}
	async function openCode(value: string) {
		if (opening) return;
		const actor = codeActor(value);
		if (!actor) return;
		opening = true;
		try {
			await queue.add(actor);
			lookup = '';
		} finally {
			opening = false;
		}
	}
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
		} catch {
			error = 'Could not copy the link. Open the link below your QR code to copy it.';
		}
	}
</script>

<svelte:head><title>Meet · atmo.rsvp</title></svelte:head>

<Modal
	bind:open={
		() => !!selectedTarget,
		(open) => {
			if (!open) closeTarget();
		}
	}
	title="Did you meet?"
	description={queue.people.length > 1
		? `${queue.people.length} people queued. Confirm to save a public connection.`
		: 'Confirm to save a public connection.'}
	dismissible={!saving}
	class="top-auto bottom-3 translate-y-0 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2"
>
	{#if selectedTarget}
		<div class="grid gap-4">
			<Person did={selectedTarget.did} initial={selectedTarget.profile} />
			{#if error || form?.message}<p role="alert" class="text-sm">{error || form?.message}</p>{/if}
			{#if targetMeeting?.outgoing}
				<p class="text-base-600 dark:text-base-400 text-sm" role="status">
					{targetMeeting.incoming
						? 'You both saved this meeting.'
						: 'Meeting saved. Waiting for them to meet you back.'}
				</p>
			{:else if user.isLoggedIn && data.canMeet}
				<div class="flex gap-2">
					<form method="POST" use:enhance={saveMeeting}>
						<input type="hidden" name="subject" value={selectedTarget.did} />
						<input
							type="hidden"
							name="incomingUri"
							value={selectedTarget.incomingUri || incomingUri(selectedTarget.did)}
						/>
						<Button type="submit" disabled={saving}>Yes, we met</Button>
					</form>
					<Button variant="ghost" disabled={saving} onclick={closeTarget}>Not now</Button>
				</div>
			{:else if !user.isLoggedIn}
				<Button class="justify-self-start" onclick={loginForTarget}>Log in</Button>
			{:else}
				<Button class="justify-self-start" onclick={authorize} disabled={authorizing}
					>{authorizing ? 'Authorizing…' : 'Enable meetings'}</Button
				>
			{/if}
		</div>
	{/if}
</Modal>

{#if feedback && !selectedTarget}
	<p
		role={error || form?.message ? 'alert' : 'status'}
		class="border-base-300 bg-base-50 dark:bg-base-925 fixed bottom-4 left-1/2 z-40 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-sm dark:border-[color-mix(in_srgb,var(--base-800)_80%,var(--base-950))]"
	>
		{feedback}
	</p>
{/if}

<div class="mx-auto max-w-3xl px-4 py-3 sm:px-6 sm:py-6">
	<a href={resolve('/(app)/tools')} class="text-base-600 dark:text-base-400 text-sm hover:underline"
		>← Tools</a
	>
	<h1 class="mt-1 mb-2 text-xl font-semibold tracking-tight sm:mb-3 sm:text-2xl">Meet</h1>

	{#if !user.isLoggedIn}
		<p class="text-base-600 dark:text-base-400 mb-4">
			Log in to show your QR code and save public meeting records.
		</p>
		<Button onclick={() => atProtoLoginModalState.show()}>Log in</Button>
	{:else if !data.canMeet}
		<p class="text-base-600 dark:text-base-400 mb-4 text-sm">
			Allow this tool to create public meeting records on your account. It won’t follow people or
			post to Bluesky.
		</p>
		<Button onclick={authorize} disabled={authorizing}
			>{authorizing ? 'Authorizing…' : 'Enable meetings'}</Button
		>
	{:else}
		<Tabs
			class="[&_[role=tabpanel]]:pt-3"
			label="Meet views"
			bind:value={tab}
			items={[
				{ value: 'meet', label: 'Meet' },
				{ value: 'history', label: 'History' }
			]}
		>
			{#snippet children(active)}
				{#if active === 'meet'}
					<div class="mx-auto grid max-w-sm gap-2 sm:gap-3 [@media(max-height:600px)]:gap-1">
						<div class="mx-auto w-full max-w-[clamp(9rem,calc(100svh-28rem),15rem)]">
							{#if scanning}
								<QrScanner onScan={scanCode} />
							{:else}
								<div class="grid justify-items-center gap-1">
									<QrCode value={shareUrl} />
									<a
										href={resolve(
											`/(app)/tools/meet?${isHandle(shareActor) ? 'actor' : 'did'}=${encodeURIComponent(shareActor)}`
										)}
										class="text-base-600 dark:text-base-400 max-w-full truncate text-sm underline"
										>{isHandle(shareActor) ? `@${shareActor}` : 'Your meeting link'}</a
									>
								</div>
							{/if}
						</div>
						<div class="flex justify-center gap-2">
							{#if scanning}
								<Button
									variant="secondary"
									class="min-h-11"
									onclick={() => {
										scanning = false;
									}}>Close camera</Button
								>
							{:else}
								<Button
									class="min-h-11"
									onclick={() => {
										error = '';
										scanning = true;
									}}><Icon img={ScanQrCode} size={20} /> Scan QR code</Button
								>
							{/if}
							<Button variant="secondary" class="min-h-11" onclick={copyLink}
								>{copied ? 'Copied' : 'Copy link'}</Button
							>
						</div>
						<form
							class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
							onsubmit={(event) => {
								event.preventDefault();
								void openCode(lookup);
							}}
						>
							<ActorSearchField
								id="meeting-actor"
								label="Meet someone"
								placeholder="Handle, link, or DID"
								bind:value={lookup}
								{searchActors}
								disabled={opening}
								onSelect={(actor) => {
									void openCode(actor.handle);
								}}
							/>
							<Button
								type="submit"
								variant="secondary"
								disabled={opening || !lookup.trim()}
								class="min-h-11">{opening ? 'Opening…' : 'Open'}</Button
							>
						</form>
						<p class="text-base-600 dark:text-base-400 text-center text-xs">
							Public connections · Compatible with <a href="https://youandme.at/" class="underline"
								>You & Me</a
							>
						</p>
					</div>
				{:else}
					{#if data.outgoingFailed || data.incomingFailed}
						<div class="mb-6 flex flex-wrap items-center gap-3 text-sm" role="alert">
							<p>
								{data.outgoingFailed
									? 'Could not load your saved meetings.'
									: 'Past incoming meetings are unavailable.'}
							</p>
							<Button variant="secondary" onclick={() => refreshMeetings()}>Retry</Button>
						</div>
					{/if}
					{#if pending.length}
						<section aria-labelledby="incoming-heading" class="mb-8">
							<h2 id="incoming-heading" class="mb-2 font-semibold">Did you meet?</h2>
							<p class="text-base-600 dark:text-base-400 mb-2 text-sm">
								Confirm to save your side with their original meeting date.
							</p>
							<ul
								class="divide-base-300 divide-y dark:divide-[color-mix(in_srgb,var(--base-800)_80%,var(--base-950))]"
								aria-live="polite"
							>
								{#each pending as person (person.did)}
									<li class="grid gap-3 py-4">
										<Person did={person.did} />
										<div class="flex gap-2">
											<form method="POST" use:enhance={saveMeeting}>
												<input type="hidden" name="subject" value={person.did} />
												<input type="hidden" name="incomingUri" value={incomingUri(person.did)} />
												<Button type="submit" disabled={saving}>Yes, we met</Button>
											</form>
											<Button
												variant="ghost"
												onclick={() => {
													dismissed = [...dismissed, person.did];
												}}>Not now</Button
											>
										</div>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
					<section aria-labelledby="met-heading">
						<h2 id="met-heading" class="mb-2 font-semibold">
							People you met{met.length ? ` · ${met.length}` : ''}
						</h2>
						{#if !met.length}<p class="text-base-600 dark:text-base-400 text-sm">
								{data.outgoingFailed
									? 'Your meetings could not be loaded.'
									: 'No meetings saved yet.'}
							</p>
						{:else}
							<ul
								class="divide-base-300 divide-y dark:divide-[color-mix(in_srgb,var(--base-800)_80%,var(--base-950))]"
							>
								{#each met as person (person.did)}
									<li class="flex flex-wrap items-center justify-between gap-3 py-4">
										<Person did={person.did} />
										<div class="text-base-600 dark:text-base-400 grid gap-1 text-xs sm:text-right">
											{#if meetingDate(person.createdAt)}<time datetime={person.createdAt}
													>{meetingDate(person.createdAt)}</time
												>{/if}
											<p role="status">{person.incoming ? 'Both confirmed' : 'Waiting for them'}</p>
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/if}
			{/snippet}
		</Tabs>
	{/if}
</div>

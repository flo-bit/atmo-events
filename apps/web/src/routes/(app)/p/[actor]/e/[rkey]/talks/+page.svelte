<script lang="ts">
	import { Button } from '@foxui/core';
	import { user } from '$lib/atproto/auth.svelte';
	import { createInAppAdapter } from '$lib/components/editor/adapter';
	import { invalidateAll } from '$app/navigation';
	import { parseFile, type ParsedFile } from '$lib/conference-import/parse';
	import {
		buildTalk,
		autoDetect,
		EVENT_COLLECTION,
		type FieldMapping,
		type BuiltTalk
	} from '$lib/conference-import/transform';

	let { data } = $props();

	let viewer = $derived({
		isLoggedIn: user.isLoggedIn,
		did: user.did ?? null,
		handle: user.profile?.handle,
		displayName: user.profile?.displayName,
		avatar: user.profile?.avatar
	});
	let adapter = $derived(createInAppAdapter({ viewer }));

	const TYPE_OPTIONS = ['talk', 'workshop', 'lightning-talk', 'panel', 'info', 'activity'];

	const FIELDS: { key: string; label: string; required?: boolean; candidates: string[] }[] = [
		{ key: 'name', label: 'Name', required: true, candidates: ['name', 'title', 'talk', 'session'] },
		{ key: 'start', label: 'Start', required: true, candidates: ['start', 'starttime', 'starts', 'begin', 'time'] },
		{ key: 'end', label: 'End', candidates: ['end', 'endtime', 'ends', 'finish'] },
		{ key: 'duration', label: 'Duration (min)', candidates: ['duration', 'length', 'minutes', 'mins'] },
		{ key: 'date', label: 'Date', candidates: ['date', 'day'] },
		{ key: 'type', label: 'Type', candidates: ['type', 'kind', 'category', 'format'] },
		{ key: 'room', label: 'Room', candidates: ['room', 'track', 'stage', 'location', 'venue'] },
		{ key: 'speakers', label: 'Speakers', candidates: ['speakers', 'speaker', 'presenters', 'presenter', 'authors', 'author'] },
		{ key: 'description', label: 'Description', candidates: ['description', 'desc', 'abstract', 'summary'] },
		{ key: 'id', label: 'ID (for updates)', candidates: ['id', 'slug', 'key', 'uid'] }
	];

	// --- setup-as-conference ---------------------------------------------------
	let tzInput = $state(
		data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
	);
	let setupBusy = $state(false);
	let needsSetup = $derived(!data.isConference || !data.timezone);

	async function setupConference() {
		setupBusy = true;
		try {
			const { value } = await adapter.getRecord({
				did: data.did,
				collection: EVENT_COLLECTION,
				rkey: data.rkey
			});
			const ad = { ...((value.additionalData as Record<string, unknown>) ?? {}), type: 'conference' };
			const record: Record<string, unknown> = { ...value, additionalData: ad };
			if (!record.timezone) record.timezone = tzInput.trim();
			await adapter.putRecord({ collection: EVENT_COLLECTION, rkey: data.rkey, record });
			await adapter.notifyUpdate?.(data.uri);
			await invalidateAll();
		} catch (e) {
			alert(`Failed to set up conference: ${(e as Error).message}`);
		} finally {
			setupBusy = false;
		}
	}

	// --- upload + mapping ------------------------------------------------------
	let parsed = $state<ParsedFile | null>(null);
	let parseError = $state<string | null>(null);
	let mapping = $state<Record<string, string | undefined>>({});
	let typeDefault = $state('talk');
	let speakerDelimiter = $state(';');
	let extractHandles = $state(true);

	async function onFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const result = parseFile(file.name, text);
			parsed = result;
			parseError = null;
			const m: Record<string, string | undefined> = {};
			for (const f of FIELDS) m[f.key] = autoDetect(result.columns, [...f.candidates]);
			mapping = m;
		} catch (err) {
			parsed = null;
			parseError = (err as Error).message;
		}
	}

	let fieldMapping = $derived<FieldMapping>({
		name: mapping.name,
		type: mapping.type,
		typeDefault,
		room: mapping.room,
		description: mapping.description,
		id: mapping.id,
		date: mapping.date,
		start: mapping.start,
		end: mapping.end,
		duration: mapping.duration,
		speakers: mapping.speakers,
		speakerDelimiter,
		extractHandles
	});

	let builtTalks = $derived.by<BuiltTalk[]>(() => {
		if (!parsed || !data.timezone) return [];
		const conf = { uri: data.uri, rkey: data.rkey, tz: data.timezone };
		return parsed.rows.map((r) => buildTalk(r, fieldMapping, conf));
	});
	let validCount = $derived(builtTalks.filter((t) => t.errors.length === 0).length);
	let invalidCount = $derived(builtTalks.length - validCount);

	function fmt(iso?: string): string {
		if (!iso || !data.timezone) return '—';
		return new Date(iso).toLocaleString('en-US', {
			timeZone: data.timezone,
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// --- commit ----------------------------------------------------------------
	let committing = $state(false);
	let progress = $state(0);
	let result = $state<{ created: number; failed: string[] } | null>(null);

	async function notifyBatch(uris: string[]) {
		for (let i = 0; i < uris.length; i += 25) {
			await fetch('/xrpc/rsvp.atmo.notifyOfUpdate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ uris: uris.slice(i, i + 25) })
			}).catch(() => {});
		}
	}

	async function commit() {
		committing = true;
		progress = 0;
		result = null;
		const valid = builtTalks.filter((t) => t.errors.length === 0);
		const uris: string[] = [];
		const failed: string[] = [];
		for (const t of valid) {
			try {
				const res = t.rkey
					? await adapter.putRecord({ collection: EVENT_COLLECTION, rkey: t.rkey, record: t.record })
					: await adapter.createRecord({ collection: EVENT_COLLECTION, record: t.record });
				uris.push(res.uri);
			} catch {
				failed.push(t.preview.name || '(unnamed)');
			}
			progress++;
		}
		await notifyBatch(uris);
		committing = false;
		result = { created: uris.length, failed };
		await invalidateAll();
	}

	// --- existing talks --------------------------------------------------------
	let busyRkey = $state<string | null>(null);

	async function removeTalk(rkey: string, uri: string) {
		if (!confirm('Remove this talk?')) return;
		busyRkey = rkey;
		try {
			await adapter.deleteRecord({ collection: EVENT_COLLECTION, rkey });
			await adapter.notifyUpdate?.(uri);
			await invalidateAll();
		} finally {
			busyRkey = null;
		}
	}

	let clearing = $state(false);
	async function clearAll() {
		if (!confirm(`Remove all ${data.talks.length} talks? This can't be undone.`)) return;
		clearing = true;
		try {
			for (const t of data.talks) {
				await adapter.deleteRecord({ collection: EVENT_COLLECTION, rkey: t.rkey }).catch(() => {});
			}
			await notifyBatch(data.talks.map((t) => t.uri));
			await invalidateAll();
		} finally {
			clearing = false;
		}
	}

	const selectClass =
		'border-base-300 dark:border-base-700 bg-base-50 dark:bg-base-900 rounded-lg border px-2 py-1.5 text-sm';
</script>

<svelte:head><title>Manage talks — {data.eventName}</title></svelte:head>

<div class="mx-auto max-w-4xl px-6 py-10">
	<a
		href="/p/{data.actor}/e/{data.rkey}"
		class="text-base-500 dark:text-base-400 hover:text-base-700 dark:hover:text-base-200 text-sm"
	>
		← {data.eventName}
	</a>
	<h1 class="text-base-900 dark:text-base-50 mt-2 mb-8 text-3xl font-bold">Manage talks</h1>

	{#if needsSetup}
		<!-- Step 1: designate the event as a conference -->
		<div class="border-base-200 dark:border-base-800 mb-8 rounded-2xl border p-6">
			<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Set up as conference</h2>
			<p class="text-base-500 dark:text-base-400 mt-1 mb-4 text-sm">
				This marks <strong>{data.eventName}</strong> as a conference so talks can be attached to it
				and shown as a timetable. Talks are laid out in the conference's timezone.
			</p>
			<label class="mb-4 block">
				<span class="text-base-600 dark:text-base-300 mb-1 block text-sm font-medium">Timezone</span>
				<input
					bind:value={tzInput}
					placeholder="America/New_York"
					class="{selectClass} w-full max-w-xs"
					disabled={!!data.timezone}
				/>
				{#if data.timezone}
					<span class="text-base-400 mt-1 block text-xs">Already set on the event.</span>
				{/if}
			</label>
			<Button onclick={setupConference} disabled={setupBusy || !tzInput.trim()}>
				{setupBusy ? 'Setting up…' : 'Set up as conference'}
			</Button>
		</div>
	{:else}
		<!-- Step 2: upload + map -->
		<div class="border-base-200 dark:border-base-800 mb-8 rounded-2xl border p-6">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">Upload talks</h2>
				<span class="text-base-400 text-xs">Times in {data.timezone}</span>
			</div>
			<p class="text-base-500 dark:text-base-400 mb-4 text-sm">
				Upload a CSV, JSON or YAML file, then map its columns to talk fields. Rows with an
				<em>ID</em> update existing talks; rows without one are created new.
			</p>
			<input
				type="file"
				accept=".csv,.tsv,.json,.yaml,.yml"
				onchange={onFile}
				class="text-base-600 dark:text-base-300 text-sm"
			/>
			{#if parseError}
				<p class="mt-2 text-sm text-red-600 dark:text-red-400">Couldn't parse file: {parseError}</p>
			{/if}

			{#if parsed}
				<p class="text-base-500 dark:text-base-400 mt-4 text-sm">
					{parsed.rows.length} rows · {parsed.columns.length} columns ({parsed.format.toUpperCase()})
				</p>

				<!-- Mapping -->
				<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each FIELDS as f (f.key)}
						<label class="flex items-center justify-between gap-2">
							<span class="text-base-600 dark:text-base-300 text-sm">
								{f.label}{#if f.required}<span class="text-red-500">*</span>{/if}
							</span>
							<select bind:value={mapping[f.key]} class="{selectClass} min-w-[10rem]">
								<option value={undefined}>—</option>
								{#each parsed.columns as col (col)}
									<option value={col}>{col}</option>
								{/each}
							</select>
						</label>
					{/each}
				</div>

				<!-- Options -->
				<div class="border-base-200 dark:border-base-800 mt-4 flex flex-wrap items-center gap-4 border-t pt-4">
					<label class="flex items-center gap-2">
						<span class="text-base-600 dark:text-base-300 text-sm">Default type</span>
						<select bind:value={typeDefault} class={selectClass}>
							{#each TYPE_OPTIONS as t (t)}<option value={t}>{t}</option>{/each}
						</select>
					</label>
					{#if mapping.speakers}
						<label class="flex items-center gap-2">
							<span class="text-base-600 dark:text-base-300 text-sm">Speaker separator</span>
							<input bind:value={speakerDelimiter} class="{selectClass} w-16" />
						</label>
						<label class="flex items-center gap-2">
							<input type="checkbox" bind:checked={extractHandles} />
							<span class="text-base-600 dark:text-base-300 text-sm">Parse <code>&lt;handle&gt;</code></span>
						</label>
					{/if}
				</div>

				<!-- Preview -->
				<div class="mt-6">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-base-700 dark:text-base-200 text-sm font-semibold">Preview</h3>
						<span class="text-base-500 dark:text-base-400 text-xs">
							{validCount} ready{invalidCount ? ` · ${invalidCount} with errors` : ''}
						</span>
					</div>
					<div class="border-base-200 dark:border-base-800 max-h-96 overflow-auto rounded-xl border">
						<table class="w-full text-left text-sm">
							<thead class="text-base-500 dark:text-base-400 bg-base-100 dark:bg-base-900 sticky top-0 text-xs uppercase">
								<tr>
									<th class="px-3 py-2 font-medium">Name</th>
									<th class="px-3 py-2 font-medium">Type</th>
									<th class="px-3 py-2 font-medium">Room</th>
									<th class="px-3 py-2 font-medium">Start</th>
									<th class="px-3 py-2 font-medium">End</th>
									<th class="px-3 py-2 font-medium">Speakers</th>
								</tr>
							</thead>
							<tbody class="divide-base-200 dark:divide-base-800 divide-y">
								{#each builtTalks as t, i (i)}
									<tr class={t.errors.length ? 'bg-red-50 dark:bg-red-950/20' : ''}>
										<td class="text-base-900 dark:text-base-100 px-3 py-2">
											{t.preview.name || '—'}
											{#if t.errors.length}
												<span class="mt-0.5 block text-xs text-red-600 dark:text-red-400">{t.errors.join('; ')}</span>
											{/if}
										</td>
										<td class="text-base-600 dark:text-base-300 px-3 py-2">{t.preview.type}</td>
										<td class="text-base-600 dark:text-base-300 px-3 py-2">{t.preview.room ?? '—'}</td>
										<td class="text-base-600 dark:text-base-300 px-3 py-2 whitespace-nowrap">{fmt(t.preview.startsAt)}</td>
										<td class="text-base-600 dark:text-base-300 px-3 py-2 whitespace-nowrap">{fmt(t.preview.endsAt)}</td>
										<td class="text-base-600 dark:text-base-300 px-3 py-2">{t.preview.speakers.map((s) => s.name).join(', ') || '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<div class="mt-4 flex items-center gap-3">
						<Button onclick={commit} disabled={committing || validCount === 0}>
							{committing ? `Saving… ${progress}/${validCount}` : `Save ${validCount} talk${validCount === 1 ? '' : 's'}`}
						</Button>
						{#if result}
							<span class="text-sm text-green-600 dark:text-green-400">
								Saved {result.created}{result.failed.length ? `, ${result.failed.length} failed` : ''}.
							</span>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Existing talks -->
		<div class="border-base-200 dark:border-base-800 rounded-2xl border p-6">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-base-900 dark:text-base-50 text-lg font-semibold">
					Current talks ({data.talks.length})
				</h2>
				{#if data.talks.length}
					<Button variant="secondary" class="rose" onclick={clearAll} disabled={clearing}>
						{clearing ? 'Removing…' : 'Clear all'}
					</Button>
				{/if}
			</div>
			{#if data.talks.length === 0}
				<p class="text-base-500 dark:text-base-400 text-sm">No talks yet.</p>
			{:else}
				<div class="divide-base-200 dark:divide-base-800 divide-y">
					{#each data.talks as t (t.rkey)}
						<div class="flex items-center justify-between gap-3 py-2">
							<div class="min-w-0">
								<a
									href="/p/{data.actor}/e/{t.rkey}"
									class="text-base-900 dark:text-base-100 truncate text-sm font-medium hover:underline"
								>
									{t.name}
								</a>
								<span class="text-base-400 ml-2 text-xs">
									{t.type}{t.room ? ` · ${t.room}` : ''} · {fmt(t.startsAt)}
								</span>
							</div>
							<button
								onclick={() => removeTalk(t.rkey, t.uri)}
								disabled={busyRkey === t.rkey}
								class="text-base-400 hover:text-red-600 dark:hover:text-red-400 shrink-0 text-xs"
							>
								{busyRkey === t.rkey ? '…' : 'Remove'}
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

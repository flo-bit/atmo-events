<script lang="ts">
	import EventEditor from '$lib/components/EventEditor.svelte';
	import { beforeNavigate } from '$app/navigation';

	let { data } = $props();

	// build prefilled eventData from scheduling flow params
	// pass UTC ISO strings directly — EventEditor's populateFromEventData()
	// handles the timezone conversion via isoToDatetimeLocalInTz()
	let prefillData = $derived.by(() => {
		if (!data.prefill) return null;
		return {
			name: data.prefill.name,
			startsAt: data.prefill.startsAt,
			endsAt: data.prefill.endsAt,
			timezone: data.prefill.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
			uri: '',
			rkey: data.rkey,
			repo: data.actorDid
		};
	});

	// when EventEditor publishes, it navigates to /p/{handle}/e/{rkey}
	// detect that and resolve the scheduling intent
	beforeNavigate(({ to }) => {
		if (!data.prefill?.scheduleId) return;
		if (!to?.url.pathname.match(/^\/p\/[^/]+\/e\/[^/]+$/)) return;

		const eventPath = to.url.pathname;

		// fire and forget — don't block navigation
		fetch('/schedule/api', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'resolve',
				request_id: data.prefill.scheduleId,
				event_uri: eventPath
			})
		});
	});
</script>

<svelte:head>
	<title>{data.prefill ? `${data.prefill.name} — ` : ''}Create Event</title>
</svelte:head>

<EventEditor eventData={prefillData} actorDid={data.actorDid} rkey={data.rkey} />

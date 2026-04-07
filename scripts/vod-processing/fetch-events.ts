/**
 * Step 1: Fetch all atmosphereconf events with VODs from the API.
 * Output: data/events.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { API_URL, VOD_PLAYBACK_BASE, DATA_DIR, EVENTS_FILE, type VodEvent } from './config.js';

async function fetchEvents(): Promise<VodEvent[]> {
	const url = `${API_URL}?actor=atmosphereconf.org&sort=startsAt&order=asc&limit=200`;
	const resp = await fetch(url);
	const data = (await resp.json()) as {
		records: Array<{
			rkey: string;
			record: {
				name?: string;
				description?: string;
				startsAt?: string;
				endsAt?: string;
				additionalData?: Record<string, unknown>;
			};
		}>;
	};

	const events: VodEvent[] = [];

	for (const r of data.records) {
		const rec = r.record;
		const ad = (rec.additionalData ?? {}) as Record<string, unknown>;
		const vodAtUri = ad.vodAtUri as string | undefined;
		if (!vodAtUri) continue;

		const speakers = (ad.speakers as Array<{ name?: string }>) ?? [];

		events.push({
			rkey: r.rkey,
			name: rec.name ?? 'unknown',
			description: rec.description ?? '',
			speakers: speakers.map((s) => s.name ?? '').filter(Boolean),
			startsAt: rec.startsAt ?? '',
			endsAt: rec.endsAt ?? '',
			vodAtUri,
			playlistUrl: `${VOD_PLAYBACK_BASE}?uri=${encodeURIComponent(vodAtUri)}`,
			room: (ad.room as string) ?? '',
			type: (ad.type as string) ?? ''
		});
	}

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
	console.log(`Found ${events.length} events with VODs → ${EVENTS_FILE}`);
	return events;
}

fetchEvents();

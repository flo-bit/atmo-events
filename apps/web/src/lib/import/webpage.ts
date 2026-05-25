import type { EventImportPrefill } from '$lib/import-event';
import type { EventImporter } from './types';
import { FETCH_HEADERS, MAX_BYTES, readLimited } from './http';
import { extractJsonLdEvent, mapJsonLdEvent } from './jsonld';
import { parseIcal } from './ical';
import { guessIanaZoneFromIsoOffset } from './util';

/**
 * Fallback importer for ordinary HTML event pages (Luma, Meetup, Eventbrite,
 * Partiful, …). Prefers JSON-LD, borrows a timezone from a linked .ics when
 * JSON-LD only carries an offset, and finally falls back to OpenGraph tags.
 */
export const webpageImporter: EventImporter = {
	name: 'webpage',
	async accept(ctx) {
		const page = await ctx.getPage();
		return page.contentType.includes('text/html') || /<html/i.test(page.text.slice(0, 500));
	},
	async parseData(ctx) {
		const { finalUrl, text } = await ctx.getPage();

		const jsonLd = extractJsonLdEvent(text);
		const icalLink = findAlternateIcalLink(text, finalUrl);

		// Fetch the linked .ics up front when present: JSON-LD only carries an
		// offset (e.g. -07:00), not an IANA tz name, so we lean on iCal's TZID
		// for that. We still use JSON-LD as the primary source when available
		// because it tends to have cleaner location data.
		let ical: Omit<EventImportPrefill, 'source'> | null = null;
		if (icalLink) {
			try {
				const icalRes = await fetch(icalLink, { headers: FETCH_HEADERS, redirect: 'follow' });
				if (icalRes.ok) {
					const icalText = await readLimited(icalRes, MAX_BYTES);
					ical = parseIcal(icalText);
				}
			} catch {
				/* ignore — JSON-LD or OG will cover for it */
			}
		}

		if (jsonLd) {
			const mapped = mapJsonLdEvent(jsonLd, finalUrl);
			if (!mapped.timezone && ical?.timezone) mapped.timezone = ical.timezone;
			if (!mapped.timezone && mapped.startsAt) {
				mapped.timezone = guessIanaZoneFromIsoOffset(mapped.startsAt);
			}
			return { source: finalUrl, ...mapped };
		}

		if (ical) return { source: finalUrl, ...ical };

		const og = extractOpenGraph(text);
		if (og.title || og.description) {
			return { source: finalUrl, name: og.title, description: og.description, imageUrl: og.image };
		}

		return null;
	}
};

function findAlternateIcalLink(html: string, baseUrl: string): string | null {
	// Prefer the canonical <link rel="alternate" type="text/calendar"> tag.
	const linkRe = /<link\b([^>]+)>/gi;
	for (const m of html.matchAll(linkRe)) {
		const attrs = m[1];
		if (!/type=["']text\/calendar["']/i.test(attrs)) continue;
		const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
		if (!href) continue;
		try {
			return new URL(href, baseUrl).toString();
		} catch {
			continue;
		}
	}

	// Fall back to any anchor pointing at a .ics file or a calendar-export
	// endpoint. Partiful, for instance, only exposes its calendar feed this way.
	const anchorRe = /href=["']([^"']+\.ics(?:\?[^"']*)?)["']/gi;
	for (const m of html.matchAll(anchorRe)) {
		try {
			return new URL(m[1], baseUrl).toString();
		} catch {
			continue;
		}
	}
	const calendarRe =
		/href=["']([^"']*(?:add[-_]?to[-_]?calendar|\/calendar|\/ics|export\.ics)[^"']*)["']/gi;
	for (const m of html.matchAll(calendarRe)) {
		try {
			return new URL(m[1], baseUrl).toString();
		} catch {
			continue;
		}
	}
	return null;
}

function extractOpenGraph(html: string): { title?: string; description?: string; image?: string } {
	const grab = (prop: string) => {
		const re = new RegExp(
			`<meta\\b[^>]*?(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']*)["']`,
			'i'
		);
		const alt = new RegExp(
			`<meta\\b[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${prop}["']`,
			'i'
		);
		return html.match(re)?.[1] ?? html.match(alt)?.[1];
	};
	return {
		title: grab('og:title') ?? grab('twitter:title'),
		description: grab('og:description') ?? grab('twitter:description') ?? grab('description'),
		image: grab('og:image') ?? grab('twitter:image')
	};
}

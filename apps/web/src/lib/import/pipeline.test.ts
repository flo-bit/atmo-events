import { describe, it, expect } from 'vitest';
import { importFromUrl, importers } from './index';
import { stubFetch, jsonReply, imageReply, blockRealFetch } from './test-support';
import svelteChicago from './__fixtures__/guild-svelte-chicago.json';

blockRealFetch();

describe('import registry order', () => {
	it('registers the host-matched guild importer before the fetch-based ical importer', () => {
		// guildImporter.accept() is a cheap URL match; icalImporter.accept() calls
		// getPage() and downloads the whole source page. If guild came after ical,
		// every guild paste would fetch (and throw away) the ~170 KB guild.host HTML
		// page first — and fail outright if that heavy page rate-limits while the
		// small JSON API is fine. Order is the guarantee; pin it.
		const names = importers.map((i) => i.name);
		expect(names.indexOf('guild')).toBeGreaterThanOrEqual(0);
		expect(names.indexOf('guild')).toBeLessThan(names.indexOf('ical'));
		expect(names.indexOf('guild')).toBeLessThan(names.indexOf('webpage'));
	});

	it('routes a guild.host URL straight to the Guild API without fetching the HTML page', async () => {
		const { urls } = stubFetch([
			{ when: '/api/next/events/', reply: () => jsonReply(svelteChicago) },
			{ when: '/i/', reply: () => imageReply('image/png') }
		]);

		const result = await importFromUrl('https://guild.host/events/svelte-chicago-march-nbdhmo');

		expect(result?.name).toBe('Svelte Chicago - March 2026');
		// It must have hit the JSON API...
		expect(urls.some((u) => u.includes('/api/next/events/'))).toBe(true);
		// ...and never the guild.host event *page* (which would mean a wasted getPage()
		// fetch by an earlier fetch-based importer). Note the API path is
		// /api/next/events/, which is intentionally excluded by this pattern.
		expect(urls.some((u) => /guild\.host\/events\//.test(u))).toBe(false);
	});
});

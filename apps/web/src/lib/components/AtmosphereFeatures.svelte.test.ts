import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import AtmosphereFeatures from './AtmosphereFeatures.svelte';

describe('homepage Atmosphere features', () => {
	it('describes all six integrations without requiring a signed-in viewer', () => {
		const { body } = render(AtmosphereFeatures);

		expect(body).toContain('aria-labelledby="atmosphere-heading"');
		expect(body).toContain('id="atmosphere-heading"');
		expect(body).toContain('Connected to the Atmosphere');
		expect(body.match(/<dt\b/g)).toHaveLength(6);
		expect(body).toContain('Bluesky follows are hosting or going to');
		expect(body).toContain('starter pack from event attendees');
		expect(body).toContain('updates automatically');
		expect(body).toContain('grain.social photo album');
		expect(body).toContain('Bluesky post as comments');
		expect(body).toContain('live stream.place stream');
		expect(body).toContain('public connections compatible with You &amp; Me');
	});

	it('adds a decorative icon to every feature', () => {
		const { body } = render(AtmosphereFeatures);

		expect(body.match(/<svg\b/g)).toHaveLength(6);
		expect(body.match(/<span aria-hidden="true"/g)).toHaveLength(6);
	});

	it('links to the Meet tool', () => {
		const { body } = render(AtmosphereFeatures);

		expect(body).toMatch(/<a href="\/tools\/meet"[^>]*>Meet<\/a>/);
	});
});

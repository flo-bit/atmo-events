import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
// Exercise the pending workspace source instead of potentially stale packaged output.
import EventLinksList from '../../../../packages/ui/src/event-view/EventLinksList.svelte';

describe('organizer-authored ticket links', () => {
	it('remain ordinary links regardless of provider', () => {
		const externalUrl = 'https://events.example/tickets/organizer-choice';
		const manualAtmosphereUrl = 'https://events.atmosphere.tickets/p/did:plc:abc/e/3mrdbziccpcah';
		const { body } = render(EventLinksList, {
			props: {
				uris: [
					{ name: 'Organizer tickets', uri: externalUrl },
					{ name: 'Atmosphere Tickets link', uri: manualAtmosphereUrl }
				]
			}
		});

		expect(body).toContain(`href="${externalUrl}"`);
		expect(body).toContain('Organizer tickets');
		expect(body).toContain(`href="${manualAtmosphereUrl}"`);
		expect(body).toContain('Atmosphere Tickets link');
	});
});

import { describe, expect, it } from 'vitest';
import { atmOrganizerTicketCreationEnabled, atmTicketOrganizerAllowed } from './config';

type Env = App.Platform['env'];

function env(organizers?: string): Env {
	return {
		ATM_APP_IDENTIFIER: 'atmo.rsvp',
		ATM_APP_PASSWORD: 'app-password',
		...(organizers === undefined ? {} : { ATM_TICKET_ORGANIZER_DIDS: organizers })
	} as Env;
}

describe('ATM ticket organizer rollout gate', () => {
	it('allows only the exact authenticated DID', () => {
		const pilot = 'did:plc:pilot123';
		expect(atmTicketOrganizerAllowed(env(pilot), pilot)).toBe(true);
		expect(atmTicketOrganizerAllowed(env(pilot), 'did:plc:pilot1234')).toBe(false);
		expect(atmTicketOrganizerAllowed(env(pilot), 'did:plc:PILOT123')).toBe(false);
	});

	it('supports a removable comma or whitespace separated pilot list', () => {
		const configured = env(' did:plc:first,\n did:web:events.example.com  did:plc:third ');
		expect(atmTicketOrganizerAllowed(configured, 'did:web:events.example.com')).toBe(true);
		expect(atmTicketOrganizerAllowed(configured, 'did:plc:third')).toBe(true);
	});

	it.each([undefined, '', '   ', '*', 'atmo.rsvp', 'did:not-complete'])(
		'fails closed for a missing or invalid allowlist: %s',
		(value) => {
			expect(atmTicketOrganizerAllowed(env(value), 'did:plc:pilot123')).toBe(false);
		}
	);

	it.each(['did:plc:pilot123,*', 'did:plc:pilot123,atmo.rsvp', 'did:plc:*'])(
		'fails the entire allowlist closed when any entry is invalid: %s',
		(value) => {
			expect(atmTicketOrganizerAllowed(env(value), 'did:plc:pilot123')).toBe(false);
		}
	);

	it('requires both ATM app credentials and an allowed organizer', () => {
		const pilot = 'did:plc:pilot123';
		expect(atmOrganizerTicketCreationEnabled(env(pilot), pilot)).toBe(true);
		expect(
			atmOrganizerTicketCreationEnabled({ ATM_TICKET_ORGANIZER_DIDS: pilot } as Env, pilot)
		).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

type Env = App.Platform['env'];

const PILOT_DID = 'did:plc:pilot123';

function event(viewerDid: string, organizerDids?: string) {
	const env = {
		ATM_APP_IDENTIFIER: 'atmo.rsvp',
		ATM_APP_PASSWORD: 'app-password',
		ATM_BROKER_URL: 'https://checkout.atmosphere.money',
		...(organizerDids === undefined ? {} : { ATM_TICKET_ORGANIZER_DIDS: organizerDids })
	} as Env;
	return {
		locals: { did: viewerDid },
		platform: { env }
	} as unknown as Parameters<typeof load>[0];
}

describe('create event ticket organizer rollout', () => {
	it('exposes Atmosphere Tickets only to the pilot organizer', async () => {
		const result = await load(event(PILOT_DID, PILOT_DID));
		expect(result.atmTicketsEnabled).toBe(true);
		expect(result.atmTicketIconUrl).toBe(
			'https://checkout.atmosphere.money/atmosphere-tickets.svg'
		);
	});

	it('does not expose ticket creation to another signed-in DID', async () => {
		const result = await load(event('did:plc:someone-else', PILOT_DID));
		expect(result.atmTicketsEnabled).toBe(false);
		expect(result.atmTicketIconUrl).toBeNull();
	});

	it('fails closed when the rollout list is not configured', async () => {
		const result = await load(event(PILOT_DID));
		expect(result.atmTicketsEnabled).toBe(false);
		expect(result.atmTicketIconUrl).toBeNull();
	});
});

import { describe, expect, it } from 'vitest';
import {
	DEV_BUYER_DID,
	createDevBuyerClient,
	getDevBuyerDidDocument,
	getDevBuyerRsvp
} from './dev-account';

function decodeJwtPayload(token: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<
		string,
		unknown
	>;
}

describe('local dev buyer', () => {
	it('publishes a matching DID document and mints scoped buyer assertions', async () => {
		const document = await getDevBuyerDidDocument();
		expect(document.id).toBe(DEV_BUYER_DID);
		expect(document.verificationMethod[0]?.id).toBe(`${DEV_BUYER_DID}#atproto`);

		const client = createDevBuyerClient();
		const response = await client.get('com.atproto.server.getServiceAuth', {
			params: {
				aud: 'did:plc:7srqsetux75b6flzbbyag2ro#AttestedNetwork',
				lxm: 'money.atmosphere.payment.assertPayer'
			}
		});
		expect(response.ok).toBe(true);
		if (!response.ok) return;
		const payload = decodeJwtPayload(response.data.token);
		expect(payload.iss).toBe(DEV_BUYER_DID);
		expect(payload.aud).toBe('did:plc:7srqsetux75b6flzbbyag2ro#AttestedNetwork');
		expect(payload.lxm).toBe('money.atmosphere.payment.assertPayer');
		expect(payload.jti).toEqual(expect.any(String));
	});

	it('keeps local RSVP writes available across page loads', async () => {
		const client = createDevBuyerClient();
		const eventUri =
			'at://did:web:atm-dev-external-app.localhost/community.lexicon.calendar.event/dev-showcase';
		const rkey = 'dev-account-test';
		await client.post('com.atproto.repo.putRecord', {
			input: {
				repo: DEV_BUYER_DID,
				collection: 'community.lexicon.calendar.rsvp',
				rkey,
				record: {
					$type: 'community.lexicon.calendar.rsvp',
					status: 'community.lexicon.calendar.rsvp#going',
					subject: { uri: eventUri },
					createdAt: new Date().toISOString()
				}
			}
		});
		expect(getDevBuyerRsvp(eventUri)?.rkey).toBe(rkey);

		await client.post('com.atproto.repo.deleteRecord', {
			input: {
				repo: DEV_BUYER_DID,
				collection: 'community.lexicon.calendar.rsvp',
				rkey
			}
		});
		expect(getDevBuyerRsvp(eventUri)).toBeNull();
	});

	it('round-trips canonical records and blobs for organizer-flow QA', async () => {
		const client = createDevBuyerClient();
		const rkey = 'dev-ticketed-event';
		const record = {
			$type: 'community.lexicon.calendar.event',
			name: 'Local ticketed event',
			status: 'community.lexicon.calendar.event#planned'
		};
		const put = await client.post('com.atproto.repo.putRecord', {
			input: {
				repo: DEV_BUYER_DID,
				collection: 'community.lexicon.calendar.event',
				rkey,
				record
			}
		});
		expect(put.ok).toBe(true);
		if (!put.ok) return;
		expect(put.data.cid).toMatch(/^bafy/);

		const get = await client.get('com.atproto.repo.getRecord', {
			params: {
				repo: DEV_BUYER_DID,
				collection: 'community.lexicon.calendar.event',
				rkey
			}
		});
		expect(get.ok).toBe(true);
		if (!get.ok) return;
		expect(get.data).toMatchObject({ uri: put.data.uri, cid: put.data.cid, value: record });

		const upload = await client.post('com.atproto.repo.uploadBlob', {
			params: { repo: DEV_BUYER_DID },
			input: new Blob(['ticket image'], { type: 'image/png' })
		});
		expect(upload.ok).toBe(true);
		if (!upload.ok) return;
		expect(upload.data.blob).toMatchObject({ mimeType: 'image/png', size: 12 });
		expect(upload.data.blob.ref.$link).toMatch(/^bafk/);
	});
});

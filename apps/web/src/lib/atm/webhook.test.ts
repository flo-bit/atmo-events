import { describe, expect, it } from 'vitest';
import {
	createCloudflareWorkerWebhookHandler,
	signAtmWebhookPayload,
	type AtmWebhookDeliveryStore
} from './sdk';

// Receiver semantics of the vendored ATM SDK under this repo's toolchain:
// signature verification (node:crypto), the delivery-store claim/complete
// lifecycle our D1 store implements, and the "unknown events are 200-ACKed"
// doctrine the /api/atm-webhook route relies on. (The D1 SQL itself needs a
// real D1 binding and is exercised in deployment, not here.)

const SECRET = 'atm_whsec_test_secret';

function makeEnvelope(overrides: Record<string, unknown> = {}) {
	return {
		id: 'del_1',
		type: 'payment.completed',
		createdAt: new Date().toISOString(),
		apiVersion: '2026-07',
		environment: 'test',
		data: { payment: { id: 'pay_1' } },
		...overrides
	};
}

function makeRequest(envelope: Record<string, unknown>, secret = SECRET): Request {
	const rawBody = JSON.stringify(envelope);
	const signature = signAtmWebhookPayload({
		rawBody,
		deliveryId: String(envelope.id),
		secret
	});
	return new Request('https://example.test/api/atm-webhook', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'atm-signature': signature,
			'atm-delivery-id': String(envelope.id)
		},
		body: rawBody
	});
}

/** In-memory store implementing the same contract as $lib/atm/db's D1 store. */
function memoryStore() {
	const completed = new Set<string>();
	const claims = new Map<string, string>();
	const store: AtmWebhookDeliveryStore = {
		claim(deliveryId) {
			if (completed.has(deliveryId)) return { status: 'completed' };
			if (claims.has(deliveryId)) return { status: 'busy' };
			const claimId = crypto.randomUUID();
			claims.set(deliveryId, claimId);
			return { status: 'claimed', claimId };
		},
		complete(deliveryId, claimId) {
			if (claims.get(deliveryId) === claimId) {
				claims.delete(deliveryId);
				completed.add(deliveryId);
			}
		},
		release(deliveryId, claimId) {
			if (claims.get(deliveryId) === claimId) claims.delete(deliveryId);
		}
	};
	return store;
}

describe('atm webhook receiver', () => {
	it('accepts a signed delivery once and dedupes the redrive', async () => {
		let handled = 0;
		const handler = createCloudflareWorkerWebhookHandler({
			secret: SECRET,
			deliveryStore: memoryStore(),
			onEvent: () => {
				handled += 1;
				return { body: { ok: true } };
			}
		});

		const first = await handler.fetch(makeRequest(makeEnvelope()));
		expect(first.status).toBe(200);
		expect(handled).toBe(1);

		// ATM redrives the same delivery id — must ACK without re-fulfilling.
		const second = await handler.fetch(makeRequest(makeEnvelope()));
		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({ duplicate: true, deliveryId: 'del_1' });
		expect(handled).toBe(1);
	});

	it('rejects a delivery signed with the wrong secret', async () => {
		let handled = 0;
		const handler = createCloudflareWorkerWebhookHandler({
			secret: SECRET,
			deliveryStore: memoryStore(),
			onEvent: () => {
				handled += 1;
			}
		});

		const res = await handler.fetch(makeRequest(makeEnvelope(), 'atm_whsec_wrong'));
		expect(res.status).toBe(400);
		expect(handled).toBe(0);
	});

	it('releases the claim on fulfillment failure so ATM can redrive', async () => {
		let attempts = 0;
		const handler = createCloudflareWorkerWebhookHandler({
			secret: SECRET,
			deliveryStore: memoryStore(),
			onEvent: () => {
				attempts += 1;
				if (attempts === 1) return { status: 500, body: { error: 'boom' } };
				return { body: { ok: true } };
			}
		});

		const failed = await handler.fetch(makeRequest(makeEnvelope()));
		expect(failed.status).toBe(500);

		// The failed claim was released — the redrive fulfills and completes.
		const retried = await handler.fetch(makeRequest(makeEnvelope()));
		expect(retried.status).toBe(200);
		expect(attempts).toBe(2);

		const deduped = await handler.fetch(makeRequest(makeEnvelope()));
		expect(await deduped.json()).toMatchObject({ duplicate: true });
		expect(attempts).toBe(2);
	});

	it('200-ACKs event types the app does not handle', async () => {
		// Mirrors the route's default arm: unknown types must never 4xx/5xx.
		const handler = createCloudflareWorkerWebhookHandler({
			secret: SECRET,
			deliveryStore: memoryStore(),
			onEvent: () => ({ body: { ok: true } })
		});

		const res = await handler.fetch(
			makeRequest(makeEnvelope({ id: 'del_2', type: 'some.future.event' }))
		);
		expect(res.status).toBe(200);
	});
});

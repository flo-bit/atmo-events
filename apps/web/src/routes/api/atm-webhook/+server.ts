import { json } from '@sveltejs/kit';
import { createCloudflareWorkerWebhookHandler } from '$lib/atm/sdk';
import { atmWebhookConfigured } from '$lib/atm/config';
import { atmDeliveryStore, ensureAtmSchema } from '$lib/atm/db';
import type { RequestHandler } from './$types';

// ATM -> us webhook receiver. ATM signs every delivery with the app's webhook
// secret (Atm-Signature, HMAC over timestamp.deliveryId.body) and redrives
// failed/unacked deliveries, so this route must be idempotent: the vendored
// SDK handler verifies the signature and runs deliveries through the D1
// dedupe store (claim -> fulfill -> complete/release).
//
// ATM doctrine: unknown/unhandled event types MUST be 200-ACKed — new event
// types appear over time and an app that 4xx/5xxes them just forces redrives.
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform?.env;
	if (!env || !atmWebhookConfigured(env)) {
		return json({ error: 'NotConfigured' }, { status: 404 });
	}

	await ensureAtmSchema(env.DB);

	const handler = createCloudflareWorkerWebhookHandler({
		secret: env.ATM_WEBHOOK_SECRET!,
		deliveryStore: atmDeliveryStore(env.DB),
		onEvent: async (event) => {
			switch (event.type) {
				case 'payment.completed': {
					// Payment settled. Ticket issuance rides the separate
					// `tickets.issued` event; ticket state itself stays in ATM (we
					// read it back via listBuyerTickets), so acknowledging +
					// recording the delivery is our whole job here.
					const payment = event.data.payment as { id?: string } | undefined;
					console.log('[atm-webhook] payment.completed', payment?.id ?? '(no id)');
					break;
				}
				case 'tickets.issued': {
					const data = event.data as {
						eventUri?: string;
						issuedCount?: number;
						paymentId?: string;
					};
					console.log(
						'[atm-webhook] tickets.issued',
						data.eventUri ?? '(no event)',
						`count=${data.issuedCount ?? '?'}`
					);
					break;
				}
				case 'ticket.checked-in': {
					const data = event.data as { eventUri?: string };
					console.log('[atm-webhook] ticket.checked-in', data.eventUri ?? '(no event)');
					break;
				}
				default:
					// Deliberately ACK everything else (see doctrine note above).
					console.log('[atm-webhook] acked unhandled event type', event.type);
			}
			return { body: { ok: true } };
		}
	});

	return handler.fetch(request);
};

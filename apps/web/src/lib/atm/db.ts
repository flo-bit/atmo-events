// D1 table backing ATM webhook delivery dedupe. Created lazily on first use
// (same pattern as the notify tables in $lib/notify/db.ts), so no migration
// step. Implements the vendored SDK's `AtmWebhookDeliveryStore` contract:
// `claim` atomically distinguishes a completed delivery from an active lease,
// `complete` marks fulfillment done, `release` frees the row so ATM's redrive
// can retry — complete/release are CAS-guarded on the claim id so a stale
// worker can never settle a newer lease.

import type { AtmWebhookDeliveryStore } from './sdk';

/** How long one worker may hold a delivery before another may take over. */
const CLAIM_LEASE_MS = 60_000;

let schemaReady = false;

export async function ensureAtmSchema(db: D1Database): Promise<void> {
	if (schemaReady) return;
	await db.batch([
		// One row per ATM webhook delivery id we have seen. `status` is
		// 'processing' while a worker holds the lease and 'completed' once
		// fulfillment succeeded; released/failed deliveries are deleted so the
		// redrive can claim them fresh.
		db.prepare(
			`CREATE TABLE IF NOT EXISTS atm_webhook_deliveries (
				delivery_id      TEXT PRIMARY KEY,
				event_type       TEXT NOT NULL,
				claim_id         TEXT NOT NULL,
				status           TEXT NOT NULL DEFAULT 'processing',
				lease_expires_at INTEGER NOT NULL,
				created_at       INTEGER NOT NULL,
				completed_at     INTEGER
			)`
		),
		db.prepare(
			`CREATE INDEX IF NOT EXISTS idx_atm_webhook_deliveries_created
				ON atm_webhook_deliveries (created_at)`
		)
	]);
	schemaReady = true;
}

/** Build the SDK delivery store over D1. Call `ensureAtmSchema` first. */
export function atmDeliveryStore(db: D1Database): AtmWebhookDeliveryStore {
	return {
		async claim(deliveryId, event) {
			const claimId = crypto.randomUUID();
			const now = Date.now();

			// Insert-or-ignore wins the claim for a never-seen delivery.
			const inserted = await db
				.prepare(
					`INSERT OR IGNORE INTO atm_webhook_deliveries
						(delivery_id, event_type, claim_id, status, lease_expires_at, created_at)
						VALUES (?, ?, ?, 'processing', ?, ?)`
				)
				.bind(deliveryId, event.type, claimId, now + CLAIM_LEASE_MS, now)
				.run();
			if ((inserted.meta?.changes ?? 0) > 0) return { status: 'claimed', claimId };

			const row = await db
				.prepare(
					`SELECT status, lease_expires_at FROM atm_webhook_deliveries WHERE delivery_id = ?`
				)
				.bind(deliveryId)
				.first<{ status: string; lease_expires_at: number }>();
			if (!row) return { status: 'busy' }; // raced a release — let ATM redrive
			if (row.status === 'completed') return { status: 'completed' };
			if (Number(row.lease_expires_at) > now) return { status: 'busy' };

			// Expired lease: take it over with a compare-and-set on the old state.
			const takeover = await db
				.prepare(
					`UPDATE atm_webhook_deliveries
						SET claim_id = ?, lease_expires_at = ?
						WHERE delivery_id = ? AND status = 'processing' AND lease_expires_at <= ?`
				)
				.bind(claimId, now + CLAIM_LEASE_MS, deliveryId, now)
				.run();
			return (takeover.meta?.changes ?? 0) > 0
				? { status: 'claimed', claimId }
				: { status: 'busy' };
		},

		async complete(deliveryId, claimId) {
			await db
				.prepare(
					`UPDATE atm_webhook_deliveries
						SET status = 'completed', completed_at = ?
						WHERE delivery_id = ? AND claim_id = ?`
				)
				.bind(Date.now(), deliveryId, claimId)
				.run();
		},

		async release(deliveryId, claimId) {
			// Delete (rather than mark failed) so ATM's redrive of the same
			// delivery id can claim it fresh — mirrors notify's releaseNotification.
			await db
				.prepare(
					`DELETE FROM atm_webhook_deliveries
						WHERE delivery_id = ? AND claim_id = ? AND status = 'processing'`
				)
				.bind(deliveryId, claimId)
				.run();
		}
	};
}

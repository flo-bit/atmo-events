import type { Connection } from './connection';

// Wrap tombstones too, so repeated deletes during a refresh have distinct identities.
export type ConnectionOverlay = Record<string, { connection: Connection | null }>;

/** Drop pre-refresh changes only when their history source was successfully read. */
export function reconcileConnectionOverlay(
	live: ConnectionOverlay,
	beforeRefresh: ConnectionOverlay,
	did: string,
	failures: { outgoingFailed: boolean; incomingFailed: boolean }
): ConnectionOverlay {
	return Object.fromEntries(
		Object.entries(live).filter(([uri, change]) => {
			// A socket event or save received during the refresh is newer than its snapshot.
			if (change !== beforeRefresh[uri]) return true;
			return uri.startsWith(`at://${did}/`) ? failures.outgoingFailed : failures.incomingFailed;
		})
	);
}

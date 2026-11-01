import { isDid } from '@atcute/lexicons/syntax';
import { CONNECTION_COLLECTION, type Connection } from './connection';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting';
export type ConnectionChange = { uri: string; connection: Connection | null };

export function parseConnectionEvent(input: unknown): ConnectionChange | null {
	if (!input || typeof input !== 'object') return null;
	const event = input as Record<string, unknown>;
	if (
		event.kind !== 'commit' ||
		!isDid(event.did) ||
		!event.commit ||
		typeof event.commit !== 'object'
	)
		return null;
	const commit = event.commit as Record<string, unknown>;
	if (
		commit.collection !== CONNECTION_COLLECTION ||
		typeof commit.rkey !== 'string' ||
		!/^[a-zA-Z0-9._:~-]{1,512}$/.test(commit.rkey)
	)
		return null;
	const uri = `at://${event.did}/${CONNECTION_COLLECTION}/${commit.rkey}`;
	if (commit.operation === 'delete') return { uri, connection: null };
	if (commit.operation !== 'create' && commit.operation !== 'update') return null;
	const record = commit.record as Record<string, unknown> | undefined;
	if (
		!record ||
		record.$type !== CONNECTION_COLLECTION ||
		!isDid(record.subject) ||
		typeof record.createdAt !== 'string' ||
		!Number.isFinite(Date.parse(record.createdAt))
	)
		return null;
	return {
		uri,
		connection: { uri, owner: event.did, subject: record.subject, createdAt: record.createdAt }
	};
}

/** Collection-wide subscription is necessary: incoming records belong to *other* DIDs. */
export function watchConnections(options: {
	onChange: (change: ConnectionChange) => void;
	onStatus?: (status: StreamStatus) => void;
	onReconnect?: () => void;
	createSocket?: (url: string) => WebSocket;
}) {
	let stopped = false;
	let socket: WebSocket | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let attempts = 0;
	let opened = false;
	// A short overlap closes the gap between SSR and opening the socket. Records are keyed by URI.
	let cursor = Date.now() * 1000 - 30_000_000;
	const createSocket = options.createSocket ?? ((url) => new WebSocket(url));
	function schedule() {
		if (stopped) return;
		options.onStatus?.('reconnecting');
		timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 30_000));
	}
	function connect() {
		if (stopped) return;
		options.onStatus?.(opened ? 'reconnecting' : 'connecting');
		const url = new URL('wss://jetstream2.us-east.bsky.network/subscribe');
		url.searchParams.set('wantedCollections', CONNECTION_COLLECTION);
		url.searchParams.set('cursor', String(Math.max(0, cursor - 1_000_000)));
		try {
			socket = createSocket(url.href);
		} catch {
			schedule();
			return;
		}
		const current = socket;
		current.onopen = () => {
			if (stopped) return;
			attempts = 0;
			options.onStatus?.('live');
			// Jetstream retention is finite. Refresh persistent records after a disconnect, too.
			if (opened) options.onReconnect?.();
			opened = true;
		};
		current.onmessage = (message) => {
			if (stopped) return;
			try {
				const event = JSON.parse(message.data);
				const change = parseConnectionEvent(event);
				if (change) options.onChange(change);
				if (typeof event.time_us === 'number' && Number.isSafeInteger(event.time_us)) {
					cursor = Math.max(cursor, Math.min(event.time_us, Date.now() * 1000));
				}
			} catch {
				/* A malformed frame must not terminate live notifications. */
			}
		};
		current.onerror = () => current.close();
		current.onclose = () => {
			if (socket === current) schedule();
		};
	}
	connect();
	return () => {
		stopped = true;
		clearTimeout(timer);
		if (socket) {
			socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
			socket.close();
		}
	};
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_COLLECTION } from './connection';
import { parseConnectionEvent, watchConnections } from './jetstream';

const alice = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
function event(operation = 'create', subject = alice) {
	return {
		did: bob,
		kind: 'commit',
		time_us: Date.now() * 1000,
		commit: {
			operation,
			collection: CONNECTION_COLLECTION,
			rkey: '3mtest',
			record: { $type: CONNECTION_COLLECTION, subject, createdAt: new Date().toISOString() }
		}
	};
}

afterEach(() => vi.useRealTimers());

describe('Jetstream meetings', () => {
	it('parses creates, updates and deletes without trusting malformed input', () => {
		expect(parseConnectionEvent(event())).toMatchObject({
			connection: { owner: bob, subject: alice }
		});
		expect(parseConnectionEvent(event('update', bob))).toMatchObject({
			connection: { subject: bob }
		});
		expect(parseConnectionEvent(event('delete'))).toEqual({
			uri: `at://${bob}/${CONNECTION_COLLECTION}/3mtest`,
			connection: null
		});
		for (const value of [
			null,
			{},
			{ ...event(), did: 'no' },
			{ ...event(), kind: 'identity' },
			{ ...event(), commit: { ...event().commit, collection: 'app.bsky.feed.post' } },
			{ ...event(), commit: { ...event().commit, record: null } },
			{ ...event(), commit: { ...event().commit, rkey: '../bad' } },
			event('create', 'not-a-did')
		]) {
			expect(parseConnectionEvent(value)).toBeNull();
		}
	});
	it('subscribes to the entire collection, replays on reconnect, and stops cleanly', () => {
		vi.useFakeTimers();
		const sockets: WebSocket[] = [];
		const createSocket = vi.fn((url: string) => {
			expect(url).toContain('wantedCollections=');
			const socket = {
				close: vi.fn(),
				onopen: null,
				onclose: null,
				onmessage: null,
				onerror: null
			} as unknown as WebSocket;
			sockets.push(socket);
			return socket;
		});
		const onChange = vi.fn(),
			onStatus = vi.fn(),
			onReconnect = vi.fn();
		const stop = watchConnections({ createSocket, onChange, onStatus, onReconnect });
		const url = new URL(createSocket.mock.calls[0]![0]);
		expect(url.searchParams.get('wantedCollections')).toBe(CONNECTION_COLLECTION);
		expect(url.searchParams.has('wantedDids')).toBe(false);
		sockets[0]!.onopen!({} as Event);
		expect(onStatus).toHaveBeenLastCalledWith('live');
		sockets[0]!.onmessage!({ data: 'invalid json' } as MessageEvent);
		sockets[0]!.onmessage!({ data: JSON.stringify(event()) } as MessageEvent);
		expect(onChange).toHaveBeenCalledOnce();
		sockets[0]!.onclose!({} as CloseEvent);
		expect(onStatus).toHaveBeenLastCalledWith('reconnecting');
		vi.advanceTimersByTime(1000);
		expect(createSocket).toHaveBeenCalledTimes(2);
		sockets[1]!.onopen!({} as Event);
		expect(onReconnect).toHaveBeenCalledOnce();
		stop();
		expect(sockets[1]!.close).toHaveBeenCalledOnce();
		expect(sockets[1]!.onclose).toBeNull();
		vi.advanceTimersByTime(60_000);
		expect(createSocket).toHaveBeenCalledTimes(2);
	});
	it('cancels a pending reconnect on navigation', () => {
		vi.useFakeTimers();
		const socket = { close: vi.fn() } as unknown as WebSocket;
		const createSocket = vi.fn(() => socket);
		const stop = watchConnections({ createSocket, onChange: vi.fn(), onStatus: vi.fn() });
		socket.onclose!({} as CloseEvent);
		stop();
		vi.advanceTimersByTime(60_000);
		expect(createSocket).toHaveBeenCalledOnce();
	});
});

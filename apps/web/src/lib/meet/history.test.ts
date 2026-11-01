import { describe, expect, it } from 'vitest';
import { CONNECTION_COLLECTION, type Connection } from './connection';
import { reconcileConnectionOverlay, type ConnectionOverlay } from './history';

const alice = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const outgoingUri = `at://${alice}/${CONNECTION_COLLECTION}/outgoing`;
const incomingUri = `at://${bob}/${CONNECTION_COLLECTION}/incoming`;
const outgoing: Connection = {
	uri: outgoingUri,
	owner: alice,
	subject: bob,
	createdAt: '2026-10-31T12:00:00Z'
};
const incoming: Connection = {
	...outgoing,
	uri: incomingUri,
	owner: bob,
	subject: alice
};
const success = { outgoingFailed: false, incomingFailed: false };

function overlay(): ConnectionOverlay {
	return {
		[outgoingUri]: { connection: outgoing },
		[incomingUri]: { connection: incoming }
	};
}

describe('meeting history reconciliation', () => {
	it('lets refreshed history replace old live records and tombstones', () => {
		const before = { ...overlay(), [incomingUri]: { connection: null } };
		expect(reconcileConnectionOverlay(before, before, alice, success)).toEqual({});
	});
	it.each(['create', 'update', 'delete', 'repeated delete'])(
		'preserves a %s received while refreshing',
		(operation) => {
			const before = overlay();
			if (operation === 'repeated delete') before[incomingUri] = { connection: null };
			const changed = {
				connection: operation.includes('delete') ? null : { ...incoming }
			};
			const live = { ...before, [incomingUri]: changed };
			if (operation === 'create') delete before[incomingUri];
			expect(reconcileConnectionOverlay(live, before, alice, success)).toEqual({
				[incomingUri]: changed
			});
		}
	);
	it('preserves saves completed during a refresh', () => {
		const before = overlay();
		const saved = { connection: { ...outgoing } };
		expect(
			reconcileConnectionOverlay({ ...before, [outgoingUri]: saved }, before, alice, success)
		).toEqual({ [outgoingUri]: saved });
	});
	it.each([
		[{ outgoingFailed: true, incomingFailed: false }, outgoingUri],
		[{ outgoingFailed: false, incomingFailed: true }, incomingUri]
	] as const)('retains only the failed source when reads fail: %j', (failures, uri) => {
		const before = overlay();
		expect(reconcileConnectionOverlay(before, before, alice, failures)).toEqual({
			[uri]: before[uri]
		});
	});
	it('does not treat a total read failure as an empty history', () => {
		const before = overlay();
		expect(
			reconcileConnectionOverlay(before, before, alice, {
				outgoingFailed: true,
				incomingFailed: true
			})
		).toEqual(before);
	});
});

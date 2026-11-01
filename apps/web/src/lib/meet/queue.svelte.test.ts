import { describe, expect, it, vi } from 'vitest';
import { createMeetingQueue } from './queue.svelte';

const alice = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const bob = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const carol = 'did:plc:cccccccccccccccccccccccc';
const dan = 'did:plc:dddddddddddddddddddddddd';
function setup(resolve = vi.fn(async (actor: string) => actor)) {
	const onError = vi.fn();
	return { queue: createMeetingQueue({ resolve, viewer: () => alice, onError }), resolve, onError };
}

describe('meeting confirmation queue', () => {
	it('collects three people in order and advances only the selected person', async () => {
		const { queue } = setup();
		await Promise.all([queue.add(bob), queue.add(carol), queue.add(dan)]);
		expect(queue.people.map((person) => person.did)).toEqual([bob, carol, dan]);
		queue.remove(bob);
		expect(queue.people.map((person) => person.did)).toEqual([carol, dan]);
	});
	it('deduplicates repeated scans and aliases before and after confirmation', async () => {
		const { queue, resolve } = setup(vi.fn(async () => bob));
		await Promise.all([queue.add('bob.test'), queue.add('bob.test'), queue.add(bob)]);
		expect(resolve).toHaveBeenCalledTimes(2);
		expect(queue.people).toHaveLength(1);
		queue.remove(bob);
		await queue.add('another-alias.test');
		expect(queue.people).toEqual([]);
	});
	it('does not let a later lookup overtake an earlier lookup', async () => {
		let finish!: (did: string) => void;
		const first = new Promise<string>((resolve) => {
			finish = resolve;
		});
		const resolve = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(carol);
		const { queue } = setup(resolve);
		const jobs = [queue.add('bob.test'), queue.add('carol.test')];
		await Promise.resolve();
		expect(resolve).toHaveBeenCalledTimes(1);
		expect(queue.resolving).toBe(true);
		finish(bob);
		await Promise.all(jobs);
		expect(queue.people.map((person) => person.did)).toEqual([bob, carol]);
		expect(queue.resolving).toBe(false);
	});
	it('continues after lookup failure and allows retrying it', async () => {
		const resolve = vi
			.fn()
			.mockRejectedValueOnce(new Error('Lookup failed'))
			.mockResolvedValueOnce(carol)
			.mockResolvedValueOnce(bob);
		const { queue, onError } = setup(resolve);
		await Promise.all([queue.add('bob.test'), queue.add('carol.test')]);
		expect(onError).toHaveBeenCalledWith('Lookup failed');
		expect(queue.people.map((person) => person.did)).toEqual([carol]);
		await queue.add('bob.test');
		expect(queue.people.map((person) => person.did)).toEqual([carol, bob]);
	});
	it('rejects the current account after resolving a handle', async () => {
		const { queue, onError } = setup(vi.fn(async () => alice));
		await queue.add('alice.test');
		expect(queue.people).toEqual([]);
		expect(onError).toHaveBeenCalledWith('That’s your own account.');
	});
	it('combines direct-link and live incoming people with scanned people', async () => {
		const { queue } = setup();
		queue.include({ did: bob, fromLink: true });
		await queue.add(bob);
		queue.include({ did: carol });
		expect(queue.people).toEqual([{ did: bob, fromLink: true }, { did: carol }]);
	});
	it('retains the original incoming URI even when history refreshes or a duplicate scan arrives', async () => {
		let uri = `at://${bob}/at.youandme.connection/original`;
		const queue = createMeetingQueue({
			resolve: async () => bob,
			viewer: () => alice,
			onError: vi.fn(),
			incomingUri: () => uri
		});
		await queue.add('bob.test');
		uri = '';
		queue.include({ did: bob });
		expect(queue.people[0].incomingUri).toBe(`at://${bob}/at.youandme.connection/original`);
		queue.include({ did: bob, incomingUri: 'at://another-record' });
		expect(queue.people[0].incomingUri).toBe(`at://${bob}/at.youandme.connection/original`);
	});
	it('attaches an incoming record to an already queued scan without adding another person', async () => {
		const { queue } = setup();
		await queue.add(bob);
		queue.include({ did: bob, incomingUri: 'at://original' });
		expect(queue.people).toEqual([{ did: bob, incomingUri: 'at://original' }]);
	});
	it('discards late resolution results and queued work after switching accounts', async () => {
		let finish!: (did: string) => void;
		const pending = new Promise<string>((resolve) => {
			finish = resolve;
		});
		const resolve = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(dan);
		const { queue, onError } = setup(resolve);
		const old = [queue.add('bob.test'), queue.add('carol.test')];
		await Promise.resolve();
		queue.clear();
		await queue.add('dan.test');
		finish(bob);
		await Promise.all(old);
		expect(queue.people).toEqual([{ did: dan }]);
		expect(queue.resolving).toBe(false);
		expect(resolve).toHaveBeenCalledTimes(2);
		expect(onError).not.toHaveBeenCalled();
	});
});

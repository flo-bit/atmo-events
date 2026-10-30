import type { Client } from '@atcute/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPackSource } from './source';

const host = 'did:plc:host';
const uri = `at://${host}/community.lexicon.calendar.event/event`;
const indexGet = vi.fn();
const resolveGet = vi.fn();
const index = { get: indexGet } as unknown as Client;
const resolver = { get: resolveGet } as unknown as Client;
const ok = (data: unknown) => ({ ok: true, data });
const event = (value: object = {}) => ok({ uri, value: { name: 'Meetup', ...value } });
const rsvp = (did: string, status: string) => ({
	did,
	value: { status: `community.lexicon.calendar.rsvp#${status}` }
});
beforeEach(() => {
	vi.resetAllMocks();
	vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

function after<T>(ms: number, value: T, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		signal.throwIfAborted();
		const abort = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', abort);
			resolve(value);
		}, ms);
		signal.addEventListener('abort', abort, { once: true });
	});
}

describe('complete event starter-pack source', () => {
	it('includes both attendance statuses, takes newest RSVP per DID, and fetches all pages', async () => {
		indexGet
			.mockResolvedValueOnce(event())
			.mockResolvedValueOnce(
				ok({
					records: [rsvp('did:plc:alice', 'notgoing'), rsvp('did:plc:bob', 'interested')],
					cursor: 'next'
				})
			)
			.mockResolvedValueOnce(
				ok({ records: [rsvp('did:plc:alice', 'going'), rsvp('did:plc:carol', 'going')] })
			);
		expect(await loadPackSource(index, resolver, uri)).toMatchObject({
			host,
			attendees: ['did:plc:bob', 'did:plc:carol']
		});
		expect(indexGet.mock.calls[2][1].params).toMatchObject({
			cursor: 'next',
			subjectUri: uri,
			limit: 200,
			order: 'desc'
		});
	});
	it('uses stable mention-facet DIDs rather than resolving a potentially reassigned handle', async () => {
		indexGet
			.mockResolvedValueOnce(
				event({
					description: '@speaker.test',
					facets: [
						{
							index: { byteStart: 0, byteEnd: 13 },
							features: [
								{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:speaker' },
								{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' },
								{ $type: 'app.bsky.richtext.facet#mention', did: 'not-a-did' }
							]
						}
					]
				})
			)
			.mockResolvedValueOnce(ok({ records: [] }));
		expect((await loadPackSource(index, resolver, uri)).mentions).toEqual(['did:plc:speaker']);
		expect(resolveGet).not.toHaveBeenCalled();
	});
	it('resolves missing mention facets even when other facets exist', async () => {
		indexGet
			.mockResolvedValueOnce(
				event({
					description: '@alice.test with @bob.test',
					facets: [
						{
							index: { byteStart: 0, byteEnd: 11 },
							features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' }]
						}
					]
				})
			)
			.mockResolvedValueOnce(ok({ records: [] }));
		resolveGet.mockResolvedValueOnce(ok({ did: 'did:plc:bob' }));
		expect((await loadPackSource(index, resolver, uri)).mentions).toEqual([
			'did:plc:alice',
			'did:plc:bob'
		]);
		expect(resolveGet.mock.calls[0][1].params).toEqual({ handle: 'bob.test' });
		expect(resolveGet).toHaveBeenCalledTimes(1);
	});
	it('resolves and deduplicates plain mentions on older descriptions', async () => {
		indexGet
			.mockResolvedValueOnce(
				event({ description: 'Talk by @alice.test with @alice.test and @missing.test' })
			)
			.mockResolvedValueOnce(ok({ records: [] }));
		resolveGet
			.mockResolvedValueOnce(ok({ did: 'did:plc:alice' }))
			.mockResolvedValueOnce({ ok: false, data: { error: 'HandleNotFound' } });
		expect((await loadPackSource(index, resolver, uri)).mentions).toEqual(['did:plc:alice']);
		expect(resolveGet).toHaveBeenCalledTimes(2);
	});
	it('fails rather than returning a truncated attendee list after a later-page error', async () => {
		indexGet
			.mockResolvedValueOnce(event())
			.mockResolvedValueOnce(ok({ records: [rsvp('did:plc:alice', 'going')], cursor: 'next' }))
			.mockResolvedValueOnce({ ok: false, status: 503, data: { error: 'Unavailable' } });
		await expect(loadPackSource(index, resolver, uri)).rejects.toThrow('complete RSVP');
	});
	it('fails on repeated cursors rather than silently dropping people or looping forever', async () => {
		indexGet.mockResolvedValueOnce(event()).mockResolvedValue(ok({ records: [], cursor: 'same' }));
		await expect(loadPackSource(index, resolver, uri)).rejects.toThrow(
			'Incomplete RSVP pagination'
		);
	});
	it('distinguishes an unavailable event index from an absent/hidden event', async () => {
		indexGet.mockResolvedValueOnce({ ok: false, status: 503, data: { error: 'Unavailable' } });
		await expect(loadPackSource(index, resolver, uri)).rejects.toMatchObject({ status: 503 });
		indexGet.mockResolvedValueOnce({ ok: false, status: 400, data: { error: 'RecordNotFound' } });
		await expect(loadPackSource(index, resolver, uri)).rejects.toMatchObject({ status: 404 });
	});
	it('resolves at most four handles concurrently and preserves description order', async () => {
		const handles = Array.from({ length: 8 }, (_, n) => `person${n}.test`);
		indexGet
			.mockResolvedValueOnce(event({ description: handles.map((h) => `@${h}`).join(' ') }))
			.mockResolvedValueOnce(ok({ records: [] }));
		let active = 0;
		let peak = 0;
		resolveGet.mockImplementation((_method, { params, signal }) => {
			active++;
			peak = Math.max(peak, active);
			const n = handles.indexOf(params.handle);
			return after(n === 0 ? 900 : 100, ok({ did: `did:plc:person${n}` }), signal).finally(
				() => active--
			);
		});
		const loaded = loadPackSource(index, resolver, uri);
		await vi.advanceTimersByTimeAsync(0);
		expect(resolveGet).toHaveBeenCalledTimes(4);
		await vi.advanceTimersByTimeAsync(1_000);
		expect((await loaded).mentions).toEqual(handles.map((_, n) => `did:plc:person${n}`));
		expect(peak).toBe(4);
		expect(active).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('aborts all workers at the total budget even when every individual response is fast enough', async () => {
		const description = Array.from({ length: 30 }, (_, n) => `@person${n}.test`).join(' ');
		indexGet.mockResolvedValueOnce(event({ description }));
		let active = 0;
		const signals: AbortSignal[] = [];
		resolveGet.mockImplementation((_method, { signal }) => {
			active++;
			signals.push(signal);
			return after(4_000, ok({ did: 'did:plc:person' }), signal).finally(() => active--);
		});
		const failed = expect(loadPackSource(index, resolver, uri)).rejects.toThrow('time budget');
		await vi.advanceTimersByTimeAsync(10_000);
		await failed;
		expect(resolveGet).toHaveBeenCalledTimes(12);
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		expect(active).toBe(0);
		expect(indexGet).toHaveBeenCalledTimes(1); // Never return a partial source or load RSVPs.
		await vi.advanceTimersByTimeAsync(60_000);
		expect(resolveGet).toHaveBeenCalledTimes(12);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('cancels sibling workers and stops queueing handles after a transient failure', async () => {
		const description = Array.from({ length: 8 }, (_, n) => `@person${n}.test`).join(' ');
		indexGet.mockResolvedValueOnce(event({ description }));
		resolveGet.mockImplementation((_method, { params, signal }) =>
			after(
				params.handle === 'person0.test' ? 100 : 4_000,
				{ ok: false, data: { error: 'Unavailable' } },
				signal
			)
		);
		const failed = expect(loadPackSource(index, resolver, uri)).rejects.toThrow(
			'resolve description'
		);
		await vi.advanceTimersByTimeAsync(100);
		await failed;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(resolveGet).toHaveBeenCalledTimes(4);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('shares the source deadline with RSVP pagination', async () => {
		indexGet
			.mockResolvedValueOnce(event())
			.mockImplementation((_method, { signal }) =>
				after(6_000, ok({ records: [], cursor: 'next' }), signal)
			);
		const failed = expect(loadPackSource(index, resolver, uri)).rejects.toThrow('time budget');
		await vi.advanceTimersByTimeAsync(10_000);
		await failed;
		expect(indexGet).toHaveBeenCalledTimes(3);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('honors an earlier parent deadline instead of resetting the budget for each load', async () => {
		indexGet.mockResolvedValueOnce(event({ description: '@person.test' }));
		resolveGet.mockImplementation((_method, { signal }) =>
			after(4_000, ok({ did: 'did:plc:person' }), signal)
		);
		const controller = new AbortController();
		const failed = expect(loadPackSource(index, resolver, uri, controller.signal)).rejects.toThrow(
			'cancelled'
		);
		await vi.advanceTimersByTimeAsync(100);
		controller.abort(new Error('cancelled'));
		await failed;
		expect(indexGet).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
	it('fails on transient mention-resolution errors instead of dropping existing mentioned members', async () => {
		indexGet.mockResolvedValueOnce(event({ description: '@alice.test' }));
		resolveGet.mockResolvedValueOnce({ ok: false, status: 503, data: { error: 'Unavailable' } });
		await expect(loadPackSource(index, resolver, uri)).rejects.toThrow('resolve description');
	});
});

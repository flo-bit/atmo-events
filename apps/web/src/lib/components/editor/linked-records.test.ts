import { describe, expect, it } from 'vitest';
import {
	eventStreamLink,
	isLinkedRecord,
	parseGrainLink,
	parseStreamplaceLink
} from '@atmo-dev/kit/events-data';
import { buildEventRecord } from '@atmo-dev/kit/events/editor';

const did = 'did:plc:abcdefghijklmnopqrstuvwx';
describe('linked record URLs', () => {
	it.each([
		`https://grain.social/profile/${did}/gallery/abc`,
		`https://grain.social/profile/${encodeURIComponent(did)}/gallery/abc/?ref=share#photo`,
		`at://${did}/social.grain.gallery/abc`
	])('normalizes %s to a stable record link', (input) => {
		expect(parseGrainLink(input)).toEqual({
			actor: did,
			rkey: 'abc',
			atUri: `at://${did}/social.grain.gallery/abc`,
			url: `https://grain.social/profile/${did}/gallery/abc`
		});
	});
	it('accepts handle-based and bare Grain links', () => {
		expect(parseGrainLink('grain.social/profile/ALICE.EXAMPLE/gallery/abc')?.actor).toBe(
			'alice.example'
		);
	});
	it.each([
		'https://grain.social.evil.test/profile/alice.example/gallery/abc',
		'https://evil.test/grain.social/profile/alice.example/gallery/abc',
		'https://user@grain.social/profile/alice.example/gallery/abc',
		'https://grain.social:8080/profile/alice.example/gallery/abc',
		'https://grain.social/profile/alice.example',
		'https://grain.social/profile/alice.example/gallery/%2Fbad',
		'https://grain.social/profile/alice.example/gallery/%ZZ',
		'at://alice.example/social.grain.photo/abc',
		'at://alice.example/social.grain.gallery/..',
		'javascript:alert(1)'
	])('rejects invalid gallery URL %s', (input) => expect(parseGrainLink(input)).toBeNull());
	it.each(['@Alice.Example', 'alice.example', 'https://stream.place/alice.example/?ref=share'])(
		'normalizes stream input %s',
		(input) => {
			expect(parseStreamplaceLink(input)).toEqual({
				actor: 'alice.example',
				url: 'https://stream.place/alice.example'
			});
		}
	);
	it.each([
		'https://stream.place.evil.test/alice.example',
		'https://stream.place/alice.example/extra',
		'https://evil.test/alice.example',
		'bad handle',
		'localhost',
		'127.0.0.1'
	])('rejects invalid stream input %s', (input) => expect(parseStreamplaceLink(input)).toBeNull());
	it('only treats complete stream URLs as linked records', () => {
		expect(eventStreamLink('alice.example')).toBeNull();
		expect(isLinkedRecord({ uri: 'https://stream.place/alice.example' })).toBe(true);
		expect(isLinkedRecord({ uri: 'https://example.com' })).toBe(false);
	});
});

describe('saving linked records', () => {
	const original = {
		$type: 'community.lexicon.calendar.event' as const,
		createdAt: '2026-01-01T12:00:00Z',
		startsAt: '2026-11-01T12:00:00Z',
		name: 'Meetup',
		did,
		rkey: 'event',
		uri: `at://${did}/community.lexicon.calendar.event/event`,
		uris: [{ uri: 'https://grain.social/profile/alice.example/gallery/abc', name: 'Photos' }],
		additionalData: { custom: 'preserved' }
	};
	async function save(links: Array<{ uri: string; name: string }>) {
		return buildEventRecord({
			eventData: original,
			isNew: false,
			name: 'Meetup',
			description: '',
			startsAt: '2026-11-01T12:00',
			endsAt: '',
			timezone: 'UTC',
			mode: 'inperson',
			visibility: 'public',
			theme: { name: 'minimal', accentColor: 'purple', baseColor: 'mist' },
			links,
			location: null,
			locationChanged: false,
			media: undefined,
			resolveHandle: async () => did
		});
	}
	it('clears the field when the last linked record is removed without mutating the original', async () => {
		const saved = await save([]);
		expect(saved).not.toHaveProperty('uris');
		expect(original.uris).toHaveLength(1);
		expect(saved.additionalData).toEqual({ custom: 'preserved' });
	});
	it('stores albums, streams and generic URLs in the same standard field', async () => {
		const links = [
			...original.uris,
			{ uri: 'https://stream.place/alice.example', name: 'Stream' },
			{ uri: 'https://example.org', name: 'Website' }
		];
		expect((await save(links)).uris).toEqual(links);
	});
});

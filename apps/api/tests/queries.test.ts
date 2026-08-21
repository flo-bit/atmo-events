import { describe, expect, it } from 'vitest';
import {
	DISCOVERABLE_CONDITION,
	MAX_HYDRATION_URIS,
	discoverableSql,
	listAuthored,
	listDiscoverable,
	listDiscoverableByUris,
	listTalks
} from '../src/queries';
import { config } from '../src/contrail.config';

const invoke = async (handler: typeof listDiscoverableByUris, search = '') =>
	handler(undefined as never, new URLSearchParams(search), config);

describe('discoverability queries', () => {
	it('uses one shared falsey showInDiscovery predicate', async () => {
		expect(discoverableSql('r.record')).toBe(DISCOVERABLE_CONDITION);
		expect(DISCOVERABLE_CONDITION).toContain(
			"json_extract(r.record, '$.preferences.showInDiscovery')"
		);
		expect(DISCOVERABLE_CONDITION).toContain('IS NULL');
		expect(DISCOVERABLE_CONDITION).toContain('!= 0');

		const source = await invoke(listDiscoverable);
		expect(source.conditions).toEqual([DISCOVERABLE_CONDITION]);
	});

	it('binds URI-list values instead of interpolating them', async () => {
		const uriA = 'at://did:plc:one/community.lexicon.calendar.event/aaa';
		const uriB = 'at://did:plc:two/community.lexicon.calendar.event/bbb';
		const injection = "at://did:plc:x/community.lexicon.calendar.event/') OR 1=1 --";
		const params = new URLSearchParams();
		params.append('uris', `${uriA},${uriB}`);
		params.append('uris', injection);

		const source = await listDiscoverableByUris(undefined as never, params, config);

		expect(source.params).toEqual([uriA, uriB, injection]);
		expect(source.conditions).toEqual(['r.uri IN (?, ?, ?)', DISCOVERABLE_CONDITION]);
		expect(source.conditions?.join(' ')).not.toContain(injection);
	});

	it('matches nothing for an empty URI list', async () => {
		const source = await invoke(listDiscoverableByUris);
		expect(source).toEqual({ conditions: ['0 = 1'] });
	});

	it('caps URI hydration below D1 bind limits', async () => {
		const uris = Array.from(
			{ length: MAX_HYDRATION_URIS + 50 },
			(_, index) => `at://did:plc:x/community.lexicon.calendar.event/${index}`
		).join(',');
		const source = await invoke(listDiscoverableByUris, `uris=${encodeURIComponent(uris)}`);

		expect(source.params).toHaveLength(MAX_HYDRATION_URIS);
		expect(source.conditions?.[0].match(/\?/g)).toHaveLength(MAX_HYDRATION_URIS);
	});
});

describe('authored-event and talk queries', () => {
	it('excludes child talks from authored event listings', async () => {
		const source = await invoke(listAuthored);
		expect(source.conditions).toEqual([
			"json_extract(r.record, '$.additionalData.parentEvent.uri') IS NULL"
		]);
	});

	it('binds the requested parent event URI for talk listings', async () => {
		const parentUri = 'at://did:plc:host/community.lexicon.calendar.event/conference';
		const source = await invoke(listTalks, `parentUri=${encodeURIComponent(parentUri)}`);

		expect(source.conditions).toEqual([
			"json_extract(r.record, '$.additionalData.parentEvent.uri') = ?"
		]);
		expect(source.params).toEqual([parentUri]);
	});

	it('matches no talks when the parent URI is absent', async () => {
		const source = await invoke(listTalks);
		expect(source.params).toEqual(['']);
	});
});

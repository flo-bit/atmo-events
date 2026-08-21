import { describe, expect, it } from 'vitest';
import { lexicons } from '../lexicons/generated';

const documents = new Map(
	lexicons.map((document) => {
		const value = document as { id: string; defs: Record<string, unknown> };
		return [value.id, value] as const;
	})
);

const customMethods = [
	'rsvp.atmo.event.listAuthored',
	'rsvp.atmo.event.listDiscoverable',
	'rsvp.atmo.event.listDiscoverableByUris',
	'rsvp.atmo.event.listTalks'
] as const;

describe('custom query lexicons', () => {
	it('publishes every custom query and no removed spaces contract', () => {
		for (const method of customMethods) expect(documents.has(method)).toBe(true);
		expect(
			[...documents.keys()].some((id) => /rsvp\.atmo\.(?:space|spaceExt|invite)\./.test(id))
		).toBe(false);
	});

	it('keeps the standard listRecords parameters, output, and definitions', () => {
		const standard = documents.get('rsvp.atmo.event.listRecords')! as any;
		const standardMain = standard.defs.main;
		const { main: _standardMain, ...standardDefinitions } = standard.defs;

		for (const method of customMethods) {
			const custom = documents.get(method)! as any;
			const customMain = custom.defs.main;
			const { main: _customMain, ...customDefinitions } = custom.defs;

			for (const [name, schema] of Object.entries(standardMain.parameters.properties)) {
				expect(customMain.parameters.properties[name]).toEqual(schema);
			}
			expect(customMain.output).toEqual(standardMain.output);
			expect(customDefinitions).toEqual(standardDefinitions);
		}
	});

	it('types the two custom selectors as required parameters', () => {
		const byUris = documents.get('rsvp.atmo.event.listDiscoverableByUris')! as any;
		const talks = documents.get('rsvp.atmo.event.listTalks')! as any;

		expect(byUris.defs.main.parameters.required).toContain('uris');
		expect(byUris.defs.main.parameters.properties.uris).toMatchObject({ type: 'string' });
		expect(talks.defs.main.parameters.required).toContain('parentUri');
		expect(talks.defs.main.parameters.properties.parentUri).toMatchObject({
			type: 'string',
			format: 'at-uri'
		});
	});
});

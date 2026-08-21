import type { PipelineQueryHandler } from '@atmo-dev/contrail';

export const MAX_HYDRATION_URIS = 60;

const PREF_PATH = '$.preferences.showInDiscovery';

export function discoverableSql(recordColumn: string): string {
	return `(json_extract(${recordColumn}, '${PREF_PATH}') IS NULL
		OR json_extract(${recordColumn}, '${PREF_PATH}') != 0)`;
}

export const DISCOVERABLE_CONDITION = discoverableSql('r.record');

export const listDiscoverable: PipelineQueryHandler = async () => ({
	conditions: [DISCOVERABLE_CONDITION]
});

export const listDiscoverableByUris: PipelineQueryHandler = async (_db, params) => {
	const uris = params
		.getAll('uris')
		.flatMap((value) => value.split(','))
		.map((uri) => uri.trim())
		.filter(Boolean)
		.slice(0, MAX_HYDRATION_URIS);

	if (uris.length === 0) return { conditions: ['0 = 1'] };

	return {
		conditions: [`r.uri IN (${uris.map(() => '?').join(', ')})`, DISCOVERABLE_CONDITION],
		params: uris
	};
};

export const listTalks: PipelineQueryHandler = async (_db, params) => ({
	conditions: [`json_extract(r.record, '$.additionalData.parentEvent.uri') = ?`],
	params: [params.get('parentUri') ?? '']
});

export const listAuthored: PipelineQueryHandler = async () => ({
	conditions: [`json_extract(r.record, '$.additionalData.parentEvent.uri') IS NULL`]
});

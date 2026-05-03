import type { ContrailConfig } from '@atmo-dev/contrail';
import { SPACE_TYPE } from './spaces/config';

export const config: ContrailConfig = {
	namespace: 'rsvp.atmo',
	// Enable the rsvp.atmo.notifyOfUpdate endpoint. The client calls it after
	// writing records to the PDS so contrail re-fetches and indexes them
	// immediately instead of waiting for the jetstream.
	notify: true,
	// `spaces` is declared statically so `pnpm generate` emits the `rsvp.atmo.space.*`
	// lexicons. The real serviceDid is injected at runtime in `$lib/contrail/index.ts`
	// via `getSpacesConfig()` — generate doesn't serialize it.
	spaces: { type: SPACE_TYPE, serviceDid: 'did:web:placeholder' },
	permissionSet: {
		title: 'Atmo Events',
		description: 'Manage your private events and rsvps.'
		// NOTE: permission-set lexicons can only reference NSIDs under their own
		// namespace (`rsvp.atmo.*`). Repo writes for `community.lexicon.*` and
		// blob uploads are declared as standalone `scope.repo(...)` /
		// `scope.blob(...)` entries in `atproto/settings.ts`, not here.
	},
	collections: {
		event: {
			collection: 'community.lexicon.calendar.event',
			queryable: {
				mode: {},
				name: {},
				status: {},
				description: {},
				'preferences.showInDiscovery': {},
				startsAt: { type: 'range' },
				endsAt: { type: 'range' },
				createdAt: { type: 'range' }
			},
			searchable: ['mode', 'name', 'status', 'description'],
			relations: {
				rsvps: {
					collection: 'rsvp',
					groupBy: 'status',
					groups: {
						going: 'community.lexicon.calendar.rsvp#going',
						interested: 'community.lexicon.calendar.rsvp#interested',
						notgoing: 'community.lexicon.calendar.rsvp#notgoing'
					}
				}
			},
			pipelineQueries: {
				// Endpoint: rsvp.atmo.event.listDiscoverable
				// Same shape as listRecords, but filters out unlisted events
				// (preferences.showInDiscovery === false). Missing field defaults
				// to true, so pre-existing records without `preferences` are included.
				listDiscoverable: async () => ({
					conditions: [
						`(json_extract(r.record, '$.preferences.showInDiscovery') IS NULL
							OR json_extract(r.record, '$.preferences.showInDiscovery') != 0)`
					]
				})
			}
		},
		rsvp: {
			collection: 'community.lexicon.calendar.rsvp',
			queryable: {
				status: {},
				'subject.uri': {},
				// Sortable so the home-page activity feed can order by when the user
				// actually RSVP'd (record.createdAt) — not by when contrail indexed
				// it (time_us). Without this, a fresh backfill clusters thousands of
				// historical RSVPs at the top of time_us order, drowning live activity.
				createdAt: { type: 'range' }
			},
			references: {
				event: {
					collection: 'event',
					field: 'subject.uri'
				}
			}
		}
	}
};

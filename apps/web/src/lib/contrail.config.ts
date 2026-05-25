import type { ContrailConfig } from '@atmo-dev/contrail';
import { SPACE_TYPE } from './spaces/config';

export const config: ContrailConfig = {
	namespace: 'rsvp.atmo',
	// Enable the rsvp.atmo.notifyOfUpdate endpoint. The client calls it after
	// writing records to the PDS so contrail re-fetches and indexes them
	// immediately instead of waiting for the jetstream.
	notify: true,
	// Refresh the SQLite query planner's statistics on a schedule so
	// multi-predicate reads (e.g. rsvp.listRecords filtered by subject.uri +
	// status) pick the selective index instead of the planner's default
	// heuristic — measured ~50x fewer rows read. Runs in the ingest cycle, gated
	// to once/24h via a persisted timestamp, bounded by PRAGMA analysis_limit so
	// it can't blow D1's per-query CPU budget. Defaults are fine.
	maintenance: { optimize: true },
	// `spaces` is declared statically so `pnpm generate` emits the `rsvp.atmo.space.*`
	// lexicons. The real serviceDid is injected at runtime in `$lib/contrail/index.ts`
	// via `getSpacesConfig()` — generate doesn't serialize it.
	spaces: { authority: { type: SPACE_TYPE, serviceDid: 'did:web:placeholder' }, recordHost: {} },
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
				}),
				// Endpoint: rsvp.atmo.event.listTalks?parentUri=at://…
				// Returns the talk events belonging to a conference, i.e. those
				// whose additionalData.parentEvent.uri matches `parentUri`. Composes
				// with the standard listRecords params (actor, sort, limit, …), so
				// pass actor=<organizer did> to scope to the organizer's own talks.
				// json_extract runs at query time, so this needs no reindex; an
				// empty/missing parentUri matches nothing (safe default).
				listTalks: async (_db, params) => ({
					conditions: [`json_extract(r.record, '$.additionalData.parentEvent.uri') = ?`],
					params: [params.get('parentUri') ?? '']
				}),
				// Endpoint: rsvp.atmo.event.listAuthored
				// Same shape as listRecords, but excludes conference talks (events
				// that belong to a parent conference via additionalData.parentEvent),
				// so a conference's talks don't flood the host's profile/listings —
				// the conference event itself still appears. Filtered in SQL so
				// pagination/cursors stay correct.
				listAuthored: async () => ({
					conditions: [`json_extract(r.record, '$.additionalData.parentEvent.uri') IS NULL`]
				})
			}
		},
		rsvp: {
			collection: 'community.lexicon.calendar.rsvp',
			queryable: {
				status: {},
				'subject.uri': {},
				createdAt: { type: 'range' }
			},
			references: {
				event: {
					collection: 'event',
					field: 'subject.uri'
				}
			}
		},
		// PR #30: contrail no longer auto-adds the follow collection from feed
		// configs — must be declared explicitly. discover:false because we only
		// want follows whose subject is already in our identity set.
		follow: {
			collection: 'app.bsky.graph.follow',
			discover: false
		}
	},
	feeds: {
		// Exposed as rsvp.atmo.getFeed?feed=network&actor=<did>&collection=<nsid>.
		// Powers the home-page "from people you follow" surface.
		// PR #30 dropped per-target maxItems in favor of a single feed-level
		// cap. The rsvp-vs-event caps from before are not expressible here.
		// (Push-back candidate: high-volume RSVPs can squeeze low-volume events
		// out of the feed.)
		network: {
			follow: 'follow',
			targets: ['event', 'rsvp'],
			maxItems: 1000
		}
	}
};

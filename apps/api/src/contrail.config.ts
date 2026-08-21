import type { ContrailConfig } from '@atmo-dev/contrail';
import { listAuthored, listDiscoverable, listDiscoverableByUris, listTalks } from './queries';

export const config: ContrailConfig = {
	namespace: 'rsvp.atmo',
	profiles: ['app.bsky.actor.profile'],
	jetstreams: ['wss://jetstream1.us-east.bsky.network'],
	orderedSource: {
		source: 'jetstream',
		epoch: 'api-atmo-rsvp-primary-2026-08'
	},
	notify: true,
	serviceAuth: {
		audience: 'did:web:api.atmo.rsvp#contrail',
		methods: ['getFeed', 'notifyOfUpdate']
	},
	maintenance: { optimize: true },
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
				listDiscoverable,
				listDiscoverableByUris,
				listTalks,
				listAuthored
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
		profile: {
			collection: 'app.bsky.actor.profile',
			discover: false,
			methods: []
		},
		follow: {
			collection: 'app.bsky.graph.follow',
			discover: false,
			subjectField: 'subject',
			methods: []
		}
	},
	feeds: {
		network: {
			targets: [
				{ collection: 'event', maxItems: 100 },
				{ collection: 'rsvp', maxItems: 250 }
			]
		}
	}
};

import type { ContrailConfig } from '@atmo-dev/contrail';

export const config: ContrailConfig = {
	namespace: 'rsvp.atmo',
	collections: {
		'community.lexicon.calendar.event': {
			queryable: {
				mode: {},
				name: {},
				status: {},
				description: {},
				startsAt: { type: 'range' },
				endsAt: { type: 'range' },
				createdAt: { type: 'range' }
			},
			searchable: ['mode', 'name', 'status', 'description'],
			relations: {
				rsvps: {
					collection: 'community.lexicon.calendar.rsvp',
					groupBy: 'status',
					groups: {
						going: 'community.lexicon.calendar.rsvp#going',
						interested: 'community.lexicon.calendar.rsvp#interested',
						notgoing: 'community.lexicon.calendar.rsvp#notgoing'
					}
				}
			}
		},
		'community.lexicon.calendar.rsvp': {
			queryable: {
				status: {},
				'subject.uri': {}
			},
			references: {
				event: {
					collection: 'community.lexicon.calendar.event',
					field: 'subject.uri'
				}
			}
		}
	}
};

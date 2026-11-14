import { describe, expect, it } from 'vitest';
import { getParentEventRef, isConferenceEvent } from '@atmo-dev/kit/events-data';
import {
	LEGACY_CONFERENCE_URI,
	LEGACY_TALKS_DID,
	conferenceTalksActor,
	normalizeLegacyConference,
	parentEventSql
} from './legacy-conference';

describe('legacy conference mapping', () => {
	it('marks the legacy conference event as a conference', () => {
		const event = normalizeLegacyConference(LEGACY_CONFERENCE_URI, {
			additionalData: {},
			timezone: undefined as string | undefined
		});
		expect(isConferenceEvent(event)).toBe(true);
		expect(event.timezone).toBe('America/Vancouver');
	});

	it('points flagged talks at the legacy conference', () => {
		const talk = normalizeLegacyConference('at://did:plc:x/c/talk', {
			additionalData: { isAtmosphereconf: true, type: 'presentation' }
		});
		expect(getParentEventRef(talk)?.uri).toBe(LEGACY_CONFERENCE_URI);
	});

	it('leaves other events untouched', () => {
		const event = { additionalData: { parentEvent: { uri: 'at://other' } } };
		expect(normalizeLegacyConference('at://did:plc:x/c/e', event)).toBe(event);
	});

	it('reads legacy talks from the talks repo', () => {
		expect(conferenceTalksActor(LEGACY_CONFERENCE_URI, 'did:plc:host')).toBe(LEGACY_TALKS_DID);
		expect(conferenceTalksActor('at://other', 'did:plc:host')).toBe('did:plc:host');
	});

	it('matches the legacy flag only for the legacy conference', () => {
		expect(parentEventSql('r', LEGACY_CONFERENCE_URI).condition).toContain('isAtmosphereconf');
		expect(parentEventSql('r', 'at://other').condition).not.toContain('isAtmosphereconf');
	});
});

import type { AtTagMetadata } from '@atmo-dev/kit/at-tags';

type ProfileRef = { did: string; uri?: string };

/** The account's events page survives deletion of its optional Bluesky profile. */
export function profileAtTags(profile: ProfileRef): AtTagMetadata {
	return {
		alternate: profile.uri ? [profile.uri] : [],
		me: [`at://${profile.did}`]
	};
}

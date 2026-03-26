export interface OpenMeetGroup {
	slug: string;
	name: string;
	description: string;
	visibility: string;
	role: string;
	memberCount: number;
	upcomingEventCount: number;
	image: string | null;
}

export interface OpenMeetEventGroup {
	slug: string;
	name: string;
	role: string;
}

export interface OpenMeetPhoto {
	path: string;
}

export interface OpenMeetUser {
	slug: string;
	name: string;
	provider: string;
	socialId: string | null;
	isShadowAccount: boolean;
	photo: OpenMeetPhoto | null;
}

export interface OpenMeetEventRole {
	id: number;
	name: string;
}

export interface OpenMeetAttendee {
	id: number;
	status: string;
	role: OpenMeetEventRole | null;
	user: OpenMeetUser;
}

export interface OpenMeetCategory {
	id: number;
	name: string;
	slug: string;
}

export interface OpenMeetEvent {
	slug: string;
	name: string;
	description: string;
	// Normalized list fields (lexicon names)
	startsAt: string;
	endsAt: string | null;
	locations: Array<{ $type: string; description?: string; locality?: string; region?: string }>;
	uris: Array<{ uri: string; name?: string }>;
	mode: string;
	uri: string | null;
	did: string | null;
	media: Array<{ role: string; alt?: string; url?: string; content?: unknown }>;
	// Common fields
	visibility: string;
	status: string;
	group: OpenMeetEventGroup | null;
	attendeesCount: number;
	userRsvpStatus: string | null;
	// Detail-only fields (present in detail response, not list)
	timeZone?: string | null;
	maxAttendees?: number;
	user?: OpenMeetDetailUser | null;
	attendees?: OpenMeetDetailAttendee[];
	categories?: OpenMeetCategory[];
	lat?: number | null;
	lon?: number | null;
}

// Detail endpoint returns a different user/attendee shape than the old types
export interface OpenMeetDetailUser {
	did: string | null;
	handle: string | null;
	displayName: string;
	avatar: string | null;
}

export interface OpenMeetDetailAttendee {
	did: string | null;
	handle: string | null;
	name: string;
	avatar: string | null;
	url: string;
	role: string | null;
}

export interface OpenMeetTokens {
	token: string;
}

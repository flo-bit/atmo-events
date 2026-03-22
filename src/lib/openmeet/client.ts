import type { OpenMeetEvent, OpenMeetGroup, OpenMeetTokens } from './types';

const OPENMEET_URL = import.meta.env.VITE_OPENMEET_URL;
const TENANT_ID = import.meta.env.VITE_OPENMEET_TENANT_ID || 'lsdfaopkljdfs';

/** True when OpenMeet integration is configured */
export const OPENMEET_ENABLED = !!OPENMEET_URL;

function headers(accessToken: string): Record<string, string> {
	return {
		Authorization: `Bearer ${accessToken}`,
		'x-tenant-id': TENANT_ID
	};
}

export async function listMyGroups(accessToken: string): Promise<OpenMeetGroup[]> {
	const res = await fetch(`${OPENMEET_URL}/api/v1/did/groups`, {
		headers: headers(accessToken)
	});
	if (!res.ok) return [];
	const data = (await res.json()) as { groups?: OpenMeetGroup[] };
	return data.groups ?? [];
}

export async function listMyEvents(
	accessToken: string,
	params?: {
		fromDate?: string;
		toDate?: string;
		groupSlug?: string;
		includePublic?: boolean;
		limit?: number;
	}
): Promise<OpenMeetEvent[]> {
	const url = new URL(`${OPENMEET_URL}/api/v1/did/events`);
	if (params?.fromDate) url.searchParams.set('fromDate', params.fromDate);
	if (params?.toDate) url.searchParams.set('toDate', params.toDate);
	if (params?.groupSlug) url.searchParams.set('groupSlug', params.groupSlug);
	if (params?.includePublic) url.searchParams.set('includePublic', 'true');
	if (params?.limit) url.searchParams.set('limit', String(params.limit));

	const res = await fetch(url.toString(), {
		headers: headers(accessToken)
	});
	if (!res.ok) return [];
	const data = (await res.json()) as { events?: OpenMeetEvent[] };
	return data.events ?? [];
}

export async function getEvent(
	accessToken: string,
	slug: string
): Promise<OpenMeetEvent | null> {
	const res = await fetch(`${OPENMEET_URL}/api/v1/did/events/${slug}`, {
		headers: headers(accessToken)
	});
	if (!res.ok) return null;
	return res.json();
}

export async function attendEvent(
	accessToken: string,
	slug: string
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
	const res = await fetch(`${OPENMEET_URL}/api/events/${slug}/attend`, {
		method: 'POST',
		headers: headers(accessToken)
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		return { ok: false, error: (body as { message?: string }).message || `RSVP failed (${res.status})` };
	}
	const data = (await res.json()) as { status?: string };
	return { ok: true, status: data.status || 'confirmed' };
}

export async function cancelAttendEvent(
	accessToken: string,
	slug: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const res = await fetch(`${OPENMEET_URL}/api/events/${slug}/cancel-attending`, {
		method: 'POST',
		headers: headers(accessToken)
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		return { ok: false, error: (body as { message?: string }).message || `Cancel failed (${res.status})` };
	}
	return { ok: true };
}

/**
 * Exchange a PDS service auth token for OpenMeet access/refresh tokens.
 * The serviceAuthToken is obtained by calling com.atproto.server.getServiceAuth
 * on the user's PDS with aud=did:web:api.openmeet.net.
 */
export async function exchangeServiceAuth(serviceAuthToken: string): Promise<OpenMeetTokens | null> {
	const res = await fetch(`${OPENMEET_URL}/api/v1/auth/atproto/service-auth`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-tenant-id': TENANT_ID
		},
		body: JSON.stringify({ token: serviceAuthToken })
	});
	if (!res.ok) return null;
	return res.json();
}

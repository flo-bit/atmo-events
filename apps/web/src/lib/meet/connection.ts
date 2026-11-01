import { isDatetime, isDid, isHandle } from '@atcute/lexicons/syntax';

// Authority-verified via lex.atmo.tools/lexicons/at.youandme.connection.
export const CONNECTION_COLLECTION = 'at.youandme.connection';
export const CONNECTION_SCOPE = `repo:${CONNECTION_COLLECTION}?action=create`;
export const connectionCapability = {
	type: 'repo',
	collection: CONNECTION_COLLECTION,
	action: 'create'
} as const;

export interface Connection {
	uri: string;
	owner: string;
	subject: string;
	createdAt: string;
}

export function connectionRecord(subject: string, createdAt = new Date().toISOString()) {
	if (!isDid(subject)) throw new Error('Invalid DID');
	if (!isDatetime(createdAt)) throw new Error('Invalid meeting date');
	return { $type: CONNECTION_COLLECTION, subject, createdAt };
}

export function incomingConnectionRkey(uri: string, owner: string): string | null {
	const prefix = `at://${owner}/${CONNECTION_COLLECTION}/`;
	if (!uri.startsWith(prefix)) return null;
	const rkey = uri.slice(prefix.length);
	return /^[a-zA-Z0-9._:~-]{1,512}$/.test(rkey) ? rkey : null;
}

export function meetingIdentifier(input: string): string | null {
	const text = input.trim();
	if (isDid(text)) return text;
	const handle = text.replace(/^@+/, '').toLowerCase();
	return isHandle(handle) ? handle : null;
}

/** Accept handles, DIDs, and our/You & Me QR codes, never arbitrary URL query parameters. */
export function parseMeetingCode(input: string, origin: string): string | null {
	const text = input.trim();
	const identifier = meetingIdentifier(text);
	if (identifier) return identifier;
	try {
		const url = new URL(text);
		const ours = url.origin === origin && url.pathname === '/tools/meet';
		const theirs = url.origin === 'https://youandme.at' && url.pathname === '/connect';
		const actor = url.searchParams.get('actor') ?? url.searchParams.get('did');
		return (ours || theirs) && !url.username && !url.password && actor
			? meetingIdentifier(actor)
			: null;
	} catch {
		return null;
	}
}

export interface Meeting {
	did: string;
	outgoing: boolean;
	incoming: boolean;
	createdAt: string;
}

export function meetingsFor(did: string, records: Iterable<Connection>): Meeting[] {
	const people = new Map<string, Meeting>();
	for (const record of records) {
		if (record.owner !== did && record.subject !== did) continue;
		const other = record.owner === did ? record.subject : record.owner;
		if (other === did) continue;
		const meeting = people.get(other) ?? {
			did: other,
			outgoing: false,
			incoming: false,
			createdAt: ''
		};
		meeting.outgoing ||= record.owner === did;
		meeting.incoming ||= record.subject === did;
		if (record.createdAt > meeting.createdAt) meeting.createdAt = record.createdAt;
		people.set(other, meeting);
	}
	return [...people.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

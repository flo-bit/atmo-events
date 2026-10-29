// Opaque continuation envelopes name a server-owned query and its public scope.
// Raw keysets belong to Contrail; city cursors hold a snapshot ID and offset.
// Clients never supply SQL filters or pipelines.
export const CURSOR_QUERIES = [
	'events',
	'happening-now',
	'hosting',
	'past-events',
	'topic',
	'city',
	'search-d1'
] as const;
export type CursorQuery = (typeof CURSOR_QUERIES)[number];
export type CursorArgs = {
	actor?: string;
	slug?: string;
	popular?: boolean;
	city?: string;
	country?: string;
	region?: string;
};
export type CursorEnvelope = { v: 1; q: CursorQuery; args?: CursorArgs; raw: string };
// Leave room for three 256-character city fields, UTF-8/JSON escaping and keysets.
const MAX_CURSOR_LEN = 16 * 1024;

function cleanArgs(args: CursorArgs): CursorArgs | undefined {
	const out: CursorArgs = {};
	if (typeof args.actor === 'string') out.actor = args.actor;
	if (typeof args.slug === 'string') out.slug = args.slug;
	if (typeof args.popular === 'boolean') out.popular = args.popular;
	for (const field of ['city', 'country', 'region'] as const) {
		if (typeof args[field] === 'string') out[field] = args[field];
	}
	return Object.keys(out).length ? out : undefined;
}

export function encodeCursor(envelope: CursorEnvelope): string {
	let binary = '';
	for (const byte of new TextEncoder().encode(JSON.stringify(envelope)))
		binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function nextCursor(
	q: CursorQuery,
	raw: string | null | undefined,
	args?: CursorArgs
): string | null {
	if (!raw) return null;
	const cleaned = args ? cleanArgs(args) : undefined;
	return encodeCursor({ v: 1, q, ...(cleaned ? { args: cleaned } : {}), raw });
}

/** Invalid, legacy and removed-backend cursors end pagination without a read. */
export function decodeCursor(token: string | null | undefined): CursorEnvelope | null {
	if (!token || token.length > MAX_CURSOR_LEN || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
	let parsed: unknown;
	try {
		const padded = token + '='.repeat((4 - (token.length % 4)) % 4);
		const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
		parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const obj = parsed as Record<string, unknown>;
	if (
		obj.v !== 1 ||
		typeof obj.q !== 'string' ||
		!(CURSOR_QUERIES as readonly string[]).includes(obj.q) ||
		typeof obj.raw !== 'string' ||
		!obj.raw
	)
		return null;
	let args: CursorArgs | undefined;
	if (obj.args !== undefined) {
		if (!obj.args || typeof obj.args !== 'object' || Array.isArray(obj.args)) return null;
		const a = obj.args as Record<string, unknown>;
		if (
			(a.actor !== undefined && typeof a.actor !== 'string') ||
			(a.slug !== undefined && typeof a.slug !== 'string') ||
			(a.popular !== undefined && typeof a.popular !== 'boolean')
		)
			return null;
		for (const field of ['city', 'country', 'region'] as const) {
			if (a[field] !== undefined && (typeof a[field] !== 'string' || a[field].length > 256))
				return null;
		}
		args = cleanArgs(a as CursorArgs);
	}
	return { v: 1, q: obj.q as CursorQuery, ...(args ? { args } : {}), raw: obj.raw };
}

/** Free-text search is not deep-linkable: its term is carried outside the token. */
export function rawForQuery(
	token: string | null | undefined,
	q: CursorQuery,
	args?: CursorArgs
): string | undefined {
	if (q === 'search-d1') return undefined;
	const envelope = decodeCursor(token);
	if (!envelope || envelope.q !== q) return undefined;
	const x = envelope.args;
	const y = args ? cleanArgs(args) : undefined;
	if (
		x?.actor !== y?.actor ||
		x?.slug !== y?.slug ||
		x?.popular !== y?.popular ||
		x?.city !== y?.city ||
		x?.country !== y?.country ||
		x?.region !== y?.region
	)
		return undefined;
	return envelope.raw;
}

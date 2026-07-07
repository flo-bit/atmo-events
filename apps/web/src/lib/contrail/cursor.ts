// Self-describing pagination cursors (om-7dbs).
//
// A cursor handed to the client is tagged with the backend that issued it, so
// load-more routes by the tag instead of re-deriving the backend from the
// request shape ("is search set AND is Meili configured"). That inference broke
// whenever a page's FIRST load came from one backend but its load-more resolved
// to the other:
//   - a D1 keyset fed to Meili: Number(base64url) -> NaN -> offset 0 -> a
//     relevance-reordered duplicate of page 1;
//   - a Meili offset fed to D1 listRecords: ignored, and the discoverable /
//     time-bound filters the first page applied get dropped.
//
// The raw cursor is opaque: a Meili offset string, or a base64url(JSON) D1
// keyset built inside @atmo-dev/contrail. We WRAP it, never rewrite it — the
// separator below can't collide because base64url's alphabet excludes ':' and a
// Meili offset is decimal digits.

export type CursorBackend = 'meili' | 'd1';

const SEP = ':';
const BACKENDS: readonly CursorBackend[] = ['meili', 'd1'];

/**
 * Tag a backend-native cursor for the client. A null/empty raw cursor stays
 * null (the backend signalled "no more pages"); tagging must not manufacture a
 * cursor where there wasn't one.
 */
export function tagCursor(backend: CursorBackend, raw: string | null | undefined): string | null {
	if (raw == null || raw === '') return null;
	return `${backend}${SEP}${raw}`;
}

export type ParsedCursor =
	| { backend: CursorBackend; raw: string }
	| { backend: null; raw: string | null };

/**
 * Split a client cursor back into { backend, raw }.
 *
 * - A recognized `meili:`/`d1:` tag routes by that backend.
 * - `null`/empty -> { backend: null, raw: null } (no cursor).
 * - Anything else is an untagged legacy cursor (in-flight from before this
 *   deploy, or an unknown prefix): { backend: null, raw: <as-is> } so the caller
 *   can fall back to the old inference and still consume it.
 */
export function parseCursor(cursor: string | null | undefined): ParsedCursor {
	if (cursor == null || cursor === '') return { backend: null, raw: null };
	const sep = cursor.indexOf(SEP);
	if (sep > 0) {
		const tag = cursor.slice(0, sep);
		if ((BACKENDS as readonly string[]).includes(tag)) {
			return { backend: tag as CursorBackend, raw: cursor.slice(sep + 1) };
		}
	}
	return { backend: null, raw: cursor };
}

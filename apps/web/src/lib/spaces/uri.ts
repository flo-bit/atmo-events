// Addresses in a space, as the permissioned data proposal writes them. Values only, so pages can
// import them.

export function spaceUri(authority: string, type: string, key: string): string {
	return `at://${authority}/space/${type}/${key}`;
}

/** A space record's URI, in the form `getRecord` returns. */
export function spaceRecordUri(
	space: string,
	repo: string,
	collection: string,
	rkey: string
): string {
	return `${space}/${repo}/${collection}/${rkey}`;
}

/** Collection and rkey are the last two segments of a plain and a space record URI alike. */
export function splitRecordUri(uri: string): { collection: string; rkey: string } {
	const segments = uri.split('/');
	return {
		collection: segments[segments.length - 2] ?? '',
		rkey: segments[segments.length - 1] ?? ''
	};
}

/** The authority and key of a space URI; null for anything else. */
export function parseSpaceUri(
	uri: string
): { authority: string; type: string; key: string } | null {
	const match = /^at:\/\/([^/]+)\/space\/([^/]+)\/([^/]+)$/.exec(uri);
	return match ? { authority: match[1], type: match[2], key: match[3] } : null;
}

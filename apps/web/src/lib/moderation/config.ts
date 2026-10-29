import { isDid } from '@atcute/lexicons/syntax';

/** Operator configuration only. Empty means nobody has moderator access. */
export function moderatorDids(value: string | undefined): string[] {
	const dids = [...new Set((value ?? '').split(/[\s,]+/).filter(Boolean))];
	if (dids.some((did) => !isDid(did) || !/^did:(plc|web):/.test(did))) {
		throw new TypeError(
			'MODERATOR_DIDS must contain comma-separated did:plc or did:web identifiers'
		);
	}
	return dids;
}

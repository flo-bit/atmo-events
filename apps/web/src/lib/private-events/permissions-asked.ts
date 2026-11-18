// Whether a person just came back from asking for private event permissions, so a page can tell
// "not asked yet" from "asked, and their server did not grant them" (most servers can't yet). The
// ask comes back to the page with the person's DID in its address. Nothing is stored, so a later
// visit offers the ask again.

const ASKED_PARAM = 'asked';

/** Where an ask made by `did` comes back to: `path`, with any query it has, marked as asked. */
export function askedReturnTo(path: string, did: string): string {
	const url = new URL(path, 'https://atmo.invalid');
	url.searchParams.set(ASKED_PARAM, did);
	return url.pathname + url.search;
}

/** `ask` offers the button, `refused` says their server did not grant it. */
export type PrivateEventAccess = 'ask' | 'refused';

/** Only the person who asked is told no: an address passed on to someone else offers them the ask. */
export function privateEventAccess(url: URL, did: string): PrivateEventAccess {
	return url.searchParams.get(ASKED_PARAM) === did ? 'refused' : 'ask';
}

// Whether a person already asked for private event permissions from this browser, so a page can
// tell "not asked yet" from "asked, and their server did not grant them" (most servers can't yet).
// A cookie, so the server renders the right page; it holds only the person's DID.
import type { Cookies } from '@sveltejs/kit';

const ASKED_COOKIE = 'atmo_private_events_asked';
const ASKED_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** In the browser, just before asking. */
export function markAsked(did: string): void {
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${ASKED_COOKIE}=${encodeURIComponent(did)}; Path=/; Max-Age=${ASKED_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/** Once a grant is held. It can be lost again, since a later plain sign-in replaces it, and that says
 *  nothing about their server, so they must be offered it again rather than told it can't. */
export function forgetAsked(cookies: Pick<Cookies, 'delete'>): void {
	cookies.delete(ASKED_COOKIE, { path: '/', secure: false, httpOnly: false });
}

/** `ask` offers the button, `refused` says their server did not grant it. */
export type PrivateEventAccess = 'ask' | 'refused';

export function privateEventAccess(cookies: Pick<Cookies, 'get'>, did: string): PrivateEventAccess {
	return cookies.get(ASKED_COOKIE) === did ? 'refused' : 'ask';
}

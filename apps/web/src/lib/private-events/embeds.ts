// What a link in a private event's description may load by itself. Out of the box, the kit shows a
// Bluesky post, a profile or a GIF as soon as the page opens, which asks Bluesky or a GIF host for
// it: that tells them someone is reading this event, and when. On a private event, each one waits
// behind its own load button instead, as videos already do.
import { setLinkEmbeds, type LinkEmbedOptions } from '@atmo-dev/kit';

export const PRIVATE_LINK_EMBEDS: LinkEmbedOptions = { clickToLoad: true };

/** For the page and everything below it. Call while the page's component is set up. */
export function holdPrivateEmbeds(): void {
	setLinkEmbeds(PRIVATE_LINK_EMBEDS);
}

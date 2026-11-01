import { parseGrainLink, type GrainClient } from '@atmo-dev/kit/grain';
import { parseStreamplaceLink } from '@atmo-dev/kit/streamplace';

export { parseGrainLink, isLinkedActor } from '@atmo-dev/kit/grain';
export { parseStreamplaceLink } from '@atmo-dev/kit/streamplace';
export type {
	GrainReference,
	GrainAlbum,
	GrainPhoto,
	GrainGallery,
	GrainAlbumPage
} from '@atmo-dev/kit/grain';
export type EventLink = { uri: string; name?: string };
export type LinkedRecordsClient = {
	getGrainGallery: GrainClient['getGallery'];
	listGrainAlbums: GrainClient['listAlbums'];
};

/** Recognize event stream URLs, not arbitrary bare handles in `uris`. */
export function eventStreamLink(uri: string) {
	return /^https?:\/\//i.test(uri) ? parseStreamplaceLink(uri) : null;
}
export function isLinkedRecord(link: EventLink): boolean {
	return !!parseGrainLink(link.uri) || !!eventStreamLink(link.uri);
}

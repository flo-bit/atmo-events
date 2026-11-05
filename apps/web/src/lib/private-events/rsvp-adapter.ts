import {
	createInAppAdapter,
	type EditorAdapter,
	type EditorViewer
} from '#lib/components/editor/adapter.js';
import { spaceRecordUri } from '#lib/spaces/uri.js';
import { privateEventSpace, RSVP_COLLECTION, RSVP_STATUSES, type RsvpStatus } from './ids';
import { cancelPrivateRsvp, rsvpToPrivateEvent } from './private-events.remote';

function nothingElse(): never {
	throw new Error('a private event page writes only RSVPs');
}

/** For a private event's page: the RSVP the view writes goes to the server, which puts it in the
 *  person's own repo in the event's space. A refusal throws, so the view never shows an RSVP that
 *  was not saved. The page's own key for it is ignored, since the event's is the RSVP's. */
export function createPrivateRsvpAdapter(
	host: string,
	rkey: string,
	viewer: EditorViewer
): EditorAdapter {
	return {
		...createInAppAdapter({ viewer }),
		linkedRecords: undefined,
		features: { delete: false, recurring: false, images: false, visibility: false },
		async putRecord({ collection, record }) {
			if (collection !== RSVP_COLLECTION) nothingElse();
			const status = String(record.status).split('#')[1] as RsvpStatus;
			if (!RSVP_STATUSES.includes(status)) throw new Error(`unknown RSVP ${record.status}`);
			const subject = record.subject as { cid?: unknown } | undefined;
			const cid = typeof subject?.cid === 'string' ? subject.cid : null;
			await rsvpToPrivateEvent({ host, rkey, status, cid });
			return {
				uri: spaceRecordUri(privateEventSpace(host, rkey), viewer.did ?? '', collection, rkey)
			};
		},
		async deleteRecord({ collection }) {
			if (collection !== RSVP_COLLECTION) nothingElse();
			await cancelPrivateRsvp({ host, rkey });
		},
		createRecord: nothingElse,
		uploadBlob: nothingElse,
		onSaved() {},
		// Never the index: it would publish who is going.
		async notifyUpdate() {}
	};
}

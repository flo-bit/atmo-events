import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import {
	createInAppAdapter,
	handleOrDid,
	type EditorAdapter,
	type EditorViewer
} from '#lib/components/editor/adapter.js';
import { cancelPrivateEvent, savePrivateEvent } from './private-events.remote';

/** The in-app adapter, with every write sent to the event's space, and nothing about it to the
 *  index. A picture is uploaded to the host's own repo as any is, and only the event's record in its
 *  space cites it, so the host's server gives it out only to the people on the event's list. */
export function createPrivateEventAdapter(viewer: EditorViewer): EditorAdapter {
	return {
		...createInAppAdapter({ viewer }),
		// Those look up public records, which a private event doesn't link to for now.
		linkedRecords: undefined,
		features: { delete: true, recurring: false, visibility: false },
		async putRecord({ rkey, record }) {
			return savePrivateEvent({ rkey, record });
		},
		async createRecord({ rkey, record }) {
			if (!rkey) throw new Error('a private event needs its key');
			return savePrivateEvent({ rkey, record });
		},
		async deleteRecord({ rkey }) {
			await cancelPrivateEvent({ rkey });
		},
		onSaved({ rkey }) {
			goto(resolve('/(app)/p/[actor]/private/[rkey]', { actor: handleOrDid(viewer), rkey }), {
				refreshAll: true
			});
		},
		onDeleted() {
			goto(resolve('/(app)'), { refreshAll: true });
		},
		async notifyUpdate() {}
	};
}

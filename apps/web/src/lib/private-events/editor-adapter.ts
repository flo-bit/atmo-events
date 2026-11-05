import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import {
	createInAppAdapter,
	type EditorAdapter,
	type EditorViewer
} from '#lib/components/editor/adapter.js';
import { cancelPrivateEvent, savePrivateEvent } from './private-events.remote';

function handleOrDid(viewer: EditorViewer): string {
	return viewer.handle && viewer.handle !== 'handle.invalid' ? viewer.handle : (viewer.did ?? '');
}

/** The in-app adapter, with every write sent to the event's space. It takes no image, since atmo
 *  can't show a private one yet, and nothing about it reaches the index. */
export function createPrivateEventAdapter(viewer: EditorViewer): EditorAdapter {
	return {
		...createInAppAdapter({ viewer }),
		// Those look up public records, which a private event doesn't link to for now.
		linkedRecords: undefined,
		features: { delete: true, recurring: false, images: false, visibility: false },
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
		async uploadBlob() {
			throw new Error('a private event takes no image');
		},
		onSaved({ rkey }) {
			goto(resolve('/(app)/p/[actor]/private/[rkey]', { actor: handleOrDid(viewer), rkey }), {
				invalidateAll: true
			});
		},
		onDeleted() {
			goto(resolve('/(app)/private'), { invalidateAll: true });
		},
		async notifyUpdate() {}
	};
}

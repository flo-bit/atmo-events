import { goto } from '$app/navigation';
import { putRecord, createRecord, deleteRecord, uploadBlob } from '$lib/atproto/methods';
import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';

export type EditorBlobRef = {
	$type: 'blob';
	ref: { $link: string };
	mimeType: string;
	size: number;
};

export type EditorViewer = {
	isLoggedIn: boolean;
	did: string | null;
	handle?: string;
	displayName?: string;
	avatar?: string;
};

export type EditorAdapter = {
	features: {
		delete: boolean;
		recurring: boolean;
		privateMode: boolean;
	};
	putRecord(opts: {
		collection: string;
		rkey: string;
		record: Record<string, unknown>;
	}): Promise<{ uri: string }>;
	createRecord(opts: {
		collection: string;
		rkey?: string;
		record: Record<string, unknown>;
	}): Promise<{ uri: string; cid?: string }>;
	deleteRecord(opts: { collection: string; rkey: string }): Promise<void>;
	uploadBlob(blob: Blob): Promise<EditorBlobRef>;
	onSaved(result: { uri: string; rkey: string; isNew: boolean }): void;
	onDeleted?(): void;
	requestLogin(): void;
	createPrivateEvent?(opts: {
		key: string;
		record: Record<string, unknown>;
	}): Promise<{ spaceUri: string; rkey: string; spaceKey: string }>;
};

function handleOrDid(viewer: EditorViewer): string {
	if (viewer.handle && viewer.handle !== 'handle.invalid') return viewer.handle;
	return viewer.did ?? '';
}

export function createInAppAdapter(opts: { viewer: EditorViewer }): EditorAdapter {
	const { viewer } = opts;
	return {
		features: { delete: true, recurring: true, privateMode: true },
		async putRecord({ collection, rkey, record }) {
			const response = await putRecord({
				collection: collection as Parameters<typeof putRecord>[0]['collection'],
				rkey,
				record
			});
			if (!response.ok) throw new Error('putRecord failed');
			if (!viewer.did) throw new Error('Not logged in');
			return { uri: `at://${viewer.did}/${collection}/${rkey}` };
		},
		async createRecord({ collection, rkey, record }) {
			const response = await createRecord({
				collection: collection as Parameters<typeof createRecord>[0]['collection'],
				rkey,
				record
			});
			if (!response.ok) throw new Error('createRecord failed');
			const data = response.data as { uri: string; cid?: string };
			return { uri: data.uri, cid: data.cid };
		},
		async deleteRecord({ collection, rkey }) {
			await deleteRecord({
				collection: collection as Parameters<typeof deleteRecord>[0]['collection'],
				rkey
			});
		},
		async uploadBlob(blob) {
			const result = await uploadBlob({ blob });
			if (!result) throw new Error('uploadBlob failed');
			const { aspectRatio: _ar, ...rest } = result as Record<string, unknown> & {
				aspectRatio?: unknown;
			};
			return rest as unknown as EditorBlobRef;
		},
		onSaved({ rkey, isNew }) {
			goto(`/p/${handleOrDid(viewer)}/e/${rkey}${isNew ? '?created=true' : ''}`);
		},
		onDeleted() {
			goto(`/p/${handleOrDid(viewer)}`);
		},
		requestLogin() {
			atProtoLoginModalState.show();
		},
		async createPrivateEvent({ key, record }) {
			const { createPrivateEvent } = await import('$lib/spaces/server/spaces.remote');
			const result = await createPrivateEvent({ key, record });
			const spaceKey = result.spaceUri.split('/').pop() ?? '';
			return { spaceUri: result.spaceUri, rkey: result.rkey, spaceKey };
		}
	};
}

export function createBlentoAdapter(opts: {
	viewer: EditorViewer;
	onAfterSave?: (result: { uri: string; rkey: string; isNew: boolean }) => void;
}): EditorAdapter {
	const { viewer, onAfterSave } = opts;
	function blento(): NonNullable<typeof window.Blento> {
		const b = typeof window !== 'undefined' ? window.Blento : undefined;
		if (!b) throw new Error('Blento SDK not available');
		return b;
	}
	return {
		features: { delete: false, recurring: true, privateMode: false },
		async putRecord({ collection, rkey, record }) {
			const plain = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
			const result = await blento().putRecord({ collection, rkey, record: plain });
			return { uri: result.uri };
		},
		async createRecord({ collection, rkey, record }) {
			const plain = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
			const result = await blento().createRecord({ collection, rkey, record: plain });
			return { uri: result.uri, cid: result.cid };
		},
		async deleteRecord({ collection, rkey }) {
			await blento().deleteRecord({ collection, rkey });
		},
		async uploadBlob(blob) {
			const ref = await blento().uploadBlob(blob);
			return ref as EditorBlobRef;
		},
		onSaved(result) {
			try {
				blento().notify('event-created', result);
			} catch (e) {
				console.error('[blento adapter] notify failed', e);
			}
			onAfterSave?.(result);
		},
		requestLogin() {
			try {
				blento().promptLogin();
			} catch {
				// Blento not present; swallow.
			}
		},
		// no createPrivateEvent — privateMode disabled in features
		// no onDeleted — delete is disabled in features
	} as EditorAdapter;
}

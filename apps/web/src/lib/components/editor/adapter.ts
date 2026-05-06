import { goto } from '$app/navigation';
import {
	putRecord,
	createRecord,
	deleteRecord,
	uploadBlob,
	getRecord,
	resolveHandle
} from '$lib/atproto/methods';
import { notifyContrailOfUpdate } from '$lib/contrail';
import { atProtoLoginModalState } from '$lib/components/LoginModal.svelte';
import type {
	EditorAdapter,
	EditorBlobRef,
	EditorViewer
} from '@atmo-dev/events-ui';

export type { EditorAdapter, EditorBlobRef, EditorViewer };

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
		async getRecord({ did, collection, rkey }) {
			const fresh = await getRecord({
				did: did as `did:${string}:${string}`,
				collection: collection as Parameters<typeof getRecord>[0]['collection'],
				rkey
			});
			const value = (fresh as { value?: Record<string, unknown> }).value ?? {};
			return { value };
		},
		async resolveHandle(handle: string) {
			return resolveHandle({ handle: handle as Parameters<typeof resolveHandle>[0]['handle'] });
		},
		onSaved({ rkey, isNew, spaceKey }) {
			const handle = handleOrDid(viewer);
			const created = isNew ? '?created=true' : '';
			if (spaceKey) {
				goto(`/p/${handle}/e/${rkey}/s/${spaceKey}${created}`);
			} else {
				goto(`/p/${handle}/e/${rkey}${created}`);
			}
		},
		onDeleted() {
			goto(`/p/${handleOrDid(viewer)}`);
		},
		requestLogin() {
			atProtoLoginModalState.show();
		},
		async notifyUpdate(uri) {
			await notifyContrailOfUpdate(uri);
		},
		async createPrivateEvent({ key, record }) {
			const { createPrivateEvent } = await import('$lib/spaces/server/spaces.remote');
			const result = await createPrivateEvent({ key, record });
			const spaceKey = result.spaceUri.split('/').pop() ?? '';
			return { spaceUri: result.spaceUri, rkey: result.rkey, spaceKey };
		},
		async putSpaceRecord({
			spaceUri,
			collection,
			rkey,
			record
		}: {
			spaceUri: string;
			collection: string;
			rkey: string;
			record: Record<string, unknown>;
		}) {
			const { putSpaceRecord } = await import('$lib/spaces/server/spaces.remote');
			const result = await putSpaceRecord({
				spaceUri,
				collection: collection as Parameters<typeof putSpaceRecord>[0]['collection'],
				rkey,
				record
			});
			return { ok: !!result };
		},
		async deleteSpaceRecord({
			spaceUri,
			collection,
			rkey
		}: {
			spaceUri: string;
			collection: string;
			rkey: string;
		}) {
			const { deleteSpaceRecord } = await import('$lib/spaces/server/spaces.remote');
			await deleteSpaceRecord({
				spaceUri,
				collection: collection as Parameters<typeof deleteSpaceRecord>[0]['collection'],
				rkey
			});
		},
		async createSpaceInvite({
			spaceUri,
			kind,
			maxUses,
			expiresAt
		}: {
			spaceUri: string;
			kind: 'read-join' | 'join';
			maxUses?: number;
			expiresAt?: number;
		}) {
			const { createInvite } = await import('$lib/spaces/server/spaces.remote');
			const result = await createInvite({
				spaceUri,
				kind,
				...(maxUses != null ? { maxUses } : {}),
				...(expiresAt != null ? { expiresAt } : {})
			});
			return { token: result.token };
		}
	};
}

export function createBlentoAdapter(opts: {
	viewer: EditorViewer;
	onAfterSave?: (result: { uri: string; rkey: string; isNew: boolean }) => void;
}): EditorAdapter {
	const { onAfterSave } = opts;
	function blento(): NonNullable<typeof window.Blento> {
		const b = typeof window !== 'undefined' ? window.Blento : undefined;
		if (!b) throw new Error('Blento SDK not available');
		return b;
	}
	const adapter: EditorAdapter = {
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
		async uploadBlob(blob: Blob) {
			const ref = await blento().uploadBlob(blob);
			return ref as EditorBlobRef;
		},
		async getRecord({ did, collection, rkey }) {
			// Blento SDK doesn't expose reads yet, so we route through atmo's xrpc
			// proxy (the embed lives inside atmo, so this is always reachable).
			const params = new URLSearchParams({ repo: did, collection, rkey });
			const r = await fetch(`/xrpc/com.atproto.repo.getRecord?${params}`);
			if (!r.ok) throw new Error('getRecord failed');
			const data = (await r.json()) as { value?: Record<string, unknown> };
			return { value: data.value ?? {} };
		},
		async resolveHandle(handle: string) {
			const params = new URLSearchParams({ handle });
			const r = await fetch(`/xrpc/com.atproto.identity.resolveHandle?${params}`);
			if (!r.ok) throw new Error('resolveHandle failed');
			const data = (await r.json()) as { did: string };
			return data.did;
		},
		onSaved(result: { uri: string; rkey: string; isNew: boolean }) {
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
	};
	return adapter;
}

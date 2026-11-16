import { goto } from '$app/navigation';
import { getRecord, resolveHandle } from '@svelte-atproto/oauth/helper';
import { atprotoNetwork } from '#lib/atproto/network.js';
import { putRecord, createRecord, deleteRecord, uploadBlob } from '#lib/atproto/repo.remote.js';
import { notifyContrailOfUpdate } from '#lib/contrail.js';
import { atProtoLoginModalState } from '#lib/components/LoginModal.svelte';
import type { EditorAdapter, EditorBlobRef, EditorViewer } from '@atmo-dev/kit/events-data';
import { createLinkedRecordsClient } from './linked-records.js';

export type { EditorAdapter, EditorBlobRef, EditorViewer };

export function handleOrDid(viewer: EditorViewer): string {
	if (viewer.handle && viewer.handle !== 'handle.invalid') return viewer.handle;
	return viewer.did ?? '';
}

export function createInAppAdapter(opts: { viewer: EditorViewer }): EditorAdapter {
	const { viewer } = opts;
	return {
		features: { delete: true, recurring: true },
		linkedRecords: createLinkedRecordsClient(),
		async putRecord({ collection, rkey, record }) {
			const response = await putRecord({
				collection: collection as Parameters<typeof putRecord>[0]['collection'],
				rkey,
				record
			});
			return { uri: response.uri };
		},
		async createRecord({ collection, rkey, record }) {
			const response = await createRecord({
				collection: collection as Parameters<typeof createRecord>[0]['collection'],
				rkey,
				record
			});
			return { uri: response.uri, cid: response.cid };
		},
		async deleteRecord({ collection, rkey }) {
			await deleteRecord({
				collection: collection as Parameters<typeof deleteRecord>[0]['collection'],
				rkey
			});
		},
		async uploadBlob(blob) {
			return uploadBlob({
				bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
				mimeType: blob.type || 'application/octet-stream'
			});
		},
		async getRecord({ did, collection, rkey }) {
			const fresh = await getRecord({
				did: did as `did:${string}:${string}`,
				collection: collection as Parameters<typeof getRecord>[0]['collection'],
				rkey,
				network: atprotoNetwork()
			});
			const value = (fresh as { value?: Record<string, unknown> }).value ?? {};
			return { value };
		},
		async resolveHandle(handle: string) {
			return resolveHandle({
				handle: handle as Parameters<typeof resolveHandle>[0]['handle'],
				network: atprotoNetwork()
			});
		},
		onSaved({ rkey, isNew }) {
			const handle = handleOrDid(viewer);
			const created = isNew ? '?created=true' : '';
			goto(`/p/${handle}/e/${rkey}${created}`);
		},
		onDeleted() {
			goto(`/p/${handleOrDid(viewer)}`);
		},
		requestLogin() {
			atProtoLoginModalState.show();
		},
		async notifyUpdate(uri) {
			await notifyContrailOfUpdate(uri);
		}
	};
}

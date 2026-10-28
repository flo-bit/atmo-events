import { vi } from 'vitest';
import type { EditorAdapter, EditorViewer } from '../src/editor/adapter.js';
import type { FlatEventRecord } from '../src/contrail.js';
export const viewer: EditorViewer = {
	isLoggedIn: true,
	canPostToBluesky: true,
	did: 'did:plc:abcdefghijklmnopqrstuvwx',
	handle: 'host.example.com',
	displayName: 'Test Host'
};
export const event: FlatEventRecord = {
	$type: 'community.lexicon.calendar.event',
	did: viewer.did!,
	rkey: 'test-event',
	uri: `at://${viewer.did}/community.lexicon.calendar.event/test-event`,
	name: 'Small web, big ideas',
	description: 'An evening of projects, ideas, and conversation.',
	startsAt: '2099-10-24T18:30:00Z',
	endsAt: '2099-10-24T21:00:00Z',
	createdAt: '2026-10-01T12:00:00Z',
	mode: 'community.lexicon.calendar.event#inperson',
	theme: { name: 'minimal', accentColor: 'purple', baseColor: 'mist' }
};
export function createAdapter(): EditorAdapter {
	return {
		features: { delete: true, recurring: true },
		putRecord: vi.fn(async () => ({ uri: event.uri })),
		createRecord: vi.fn(async () => ({
			uri: `at://${viewer.did}/app.bsky.feed.post/test-post`,
			cid: 'test-cid'
		})),
		deleteRecord: vi.fn(async () => {}),
		uploadBlob: vi.fn(async () => ({
			$type: 'blob' as const,
			ref: { $link: 'test-blob' },
			mimeType: 'image/png',
			size: 10
		})),
		getRecord: vi.fn(async () => ({ value: { ...event } })),
		resolveHandle: vi.fn(async () => viewer.did!),
		onSaved: vi.fn(),
		onDeleted: vi.fn(),
		requestLogin: vi.fn(),
		notifyUpdate: vi.fn(async () => {})
	};
}

/**
 * Adapter contract for `EventEditor`, `EventView` and their child components.
 *
 * The package never reaches into atproto/session/navigation directly. Consumers
 * implement this interface (typically with their own atcute client + router)
 * and pass it in as a prop. The atmo app provides `createInAppAdapter`; other
 * hosts (e.g. blento) provide their own.
 */

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
	getRecord(opts: {
		did: string;
		collection: string;
		rkey: string;
	}): Promise<{ value: Record<string, unknown> }>;
	resolveHandle(handle: string): Promise<string>;
	onSaved(result: { uri: string; rkey: string; isNew: boolean }): void;
	onDeleted?(): void;
	requestLogin(): void;
	notifyUpdate?(uri: string): Promise<void>;
};

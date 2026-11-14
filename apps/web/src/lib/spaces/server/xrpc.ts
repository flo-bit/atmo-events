// One way to send an XRPC call and read its answer. A PDS's error message is
// never kept, since it can carry what a user typed: callers match on the error's name.

export type XrpcHandle = (pathname: string, init: RequestInit) => Promise<Response>;

export type XrpcRequest = { body: Record<string, unknown> } | { query: Record<string, string> };

export class XrpcError extends Error {
	constructor(
		readonly nsid: string,
		readonly status: number,
		/** The protocol's error name, such as `RecordNotFound`; null when the body had none. */
		readonly error: string | null
	) {
		super(`${nsid} failed: ${status}${error ? ` ${error}` : ''}`);
		this.name = 'XrpcError';
	}
}

export type XrpcAnswer =
	| { ok: true; status: number; data: Record<string, unknown> }
	| { ok: false; status: number; error: string | null };

/** For a caller that acts on the answer itself. A body that is not JSON reads as empty. */
export async function readXrpc(res: Response): Promise<XrpcAnswer> {
	const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (res.ok) return { ok: true, status: res.status, data: data ?? {} };
	return {
		ok: false,
		status: res.status,
		error: typeof data?.error === 'string' ? data.error : null
	};
}

export function answerError(nsid: string, answer: { status: number; error: string | null }) {
	return new XrpcError(nsid, answer.status, answer.error);
}

/** Throws `XrpcError` on any answer but 2xx. */
export async function xrpc(
	handle: XrpcHandle,
	nsid: string,
	request: XrpcRequest
): Promise<Record<string, unknown>> {
	const res =
		'query' in request
			? await handle(`/xrpc/${nsid}?${new URLSearchParams(request.query)}`, { method: 'GET' })
			: await handle(`/xrpc/${nsid}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(request.body)
				});
	const answer = await readXrpc(res);
	if (answer.ok) return answer.data;
	throw answerError(nsid, answer);
}

/** `isRecordNotFound` for an answer not yet thrown. */
export function answerIsRecordNotFound(answer: XrpcAnswer): boolean {
	return !answer.ok && answer.status === 400 && answer.error === 'RecordNotFound';
}

/** The only answer that proves a record absent; a 5xx is not "absent". */
export function isRecordNotFound(e: unknown): boolean {
	return e instanceof XrpcError && e.status === 400 && e.error === 'RecordNotFound';
}

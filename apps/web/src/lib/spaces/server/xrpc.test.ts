import { describe, expect, it, vi } from 'vitest';
import { isAuthRefused, isRecordNotFound, xrpc, XrpcError, type XrpcHandle } from './xrpc';

const answering = (status: number, body: unknown) =>
	vi.fn<XrpcHandle>(async () => new Response(JSON.stringify(body), { status }));

describe('xrpc', () => {
	it('sends a query as GET with its parameters encoded', async () => {
		const handle = answering(200, { value: {} });
		await xrpc(handle, 'com.atproto.repo.getRecord', { query: { repo: 'did:plc:g', rkey: 'a b' } });
		expect(handle).toHaveBeenCalledWith(
			'/xrpc/com.atproto.repo.getRecord?repo=did%3Aplc%3Ag&rkey=a+b',
			{ method: 'GET' }
		);
	});

	it('sends a body as JSON and returns the answer', async () => {
		const handle = answering(200, { uri: 'at://x' });
		expect(await xrpc(handle, 'com.atproto.repo.putRecord', { body: { a: 1 } })).toEqual({
			uri: 'at://x'
		});
		const [, init] = handle.mock.calls[0];
		expect(init).toMatchObject({ method: 'POST', body: '{"a":1}' });
	});

	it('throws a typed error that keeps the code but never the PDS message', async () => {
		const handle = answering(400, { error: 'RecordNotFound', message: 'secret typed text' });
		const failure = await xrpc(handle, 'com.atproto.repo.getRecord', { query: {} }).catch(
			(e: unknown) => e
		);
		expect(failure).toBeInstanceOf(XrpcError);
		expect(failure).toMatchObject({
			nsid: 'com.atproto.repo.getRecord',
			status: 400,
			error: 'RecordNotFound'
		});
		expect((failure as Error).message).not.toContain('secret');
		expect(isRecordNotFound(failure)).toBe(true);
		expect(isAuthRefused(failure)).toBe(false);
	});

	it('does not read a 5xx or a body without an error name as absent', async () => {
		const outage = await xrpc(answering(502, {}), 'x.y', { query: {} }).catch((e: unknown) => e);
		expect(isRecordNotFound(outage)).toBe(false);
		expect(outage).toMatchObject({ status: 502, error: null });
	});

	it('names a refused token so the caller can ask to link again', async () => {
		const refused = await xrpc(answering(401, { error: 'InvalidToken' }), 'x.y', {
			query: {}
		}).catch((e: unknown) => e);
		expect(isAuthRefused(refused)).toBe(true);
	});
});

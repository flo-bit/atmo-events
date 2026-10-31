import { beforeEach, describe, expect, it, vi } from 'vitest';
import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';

const mocks = vi.hoisted(() => ({ getEventStarterPack: vi.fn(), getRequestEvent: vi.fn() }));
vi.mock('./runtime', () => ({ getEventStarterPack: mocks.getEventStarterPack }));
vi.mock('$app/server', () => ({
	command: (_schema: unknown, handler: unknown) =>
		Object.assign(handler as object, { __: { type: 'command' } }),
	getRequestEvent: mocks.getRequestEvent
}));
import { openStarterPack } from './packs.remote';

const eventUri = 'at://did:plc:host/community.lexicon.calendar.event/event';
const limit = vi.fn();
const headers = vi.fn();
beforeEach(() => {
	vi.resetAllMocks();
	Object.assign(env, { STARTER_PACK_RATE_LIMITER: { limit } });
	limit.mockResolvedValue({ success: true });
	mocks.getRequestEvent.mockReturnValue({
		setHeaders: headers,
		getClientAddress: () => '192.0.2.1'
	});
	mocks.getEventStarterPack.mockResolvedValue('https://bsky.app/starter-pack/did:plc:bot/pack');
});

describe('public starter-pack command', () => {
	it('allows anonymous clicks, supplies only the event URI, and disables shared caching', async () => {
		expect(await openStarterPack({ eventUri })).toEqual({
			url: 'https://bsky.app/starter-pack/did:plc:bot/pack'
		});
		expect(mocks.getEventStarterPack).toHaveBeenCalledExactlyOnceWith(env, eventUri);
		expect(limit).toHaveBeenCalledExactlyOnceWith({ key: '192.0.2.1' });
		expect(headers).toHaveBeenCalledWith({ 'cache-control': 'no-store' });
	});
	it('rejects arbitrary URLs and records before using the bot', async () => {
		await expect(openStarterPack({ eventUri: 'https://attacker.test/' })).rejects.toMatchObject({
			status: 400
		});
		expect(mocks.getEventStarterPack).not.toHaveBeenCalled();
	});
	it('rate-limits before authenticating or writing as the bot', async () => {
		limit.mockResolvedValue({ success: false });
		await expect(openStarterPack({ eventUri })).rejects.toMatchObject({ status: 429 });
		expect(mocks.getEventStarterPack).not.toHaveBeenCalled();
	});
	it('preserves genuine missing/hidden-event errors', async () => {
		mocks.getEventStarterPack.mockImplementation(() => error(404, 'Event not found'));
		await expect(openStarterPack({ eventUri })).rejects.toMatchObject({ status: 404 });
	});
	it('does not leak bot/PDS errors or pretend a failed creation succeeded', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.getEventStarterPack.mockRejectedValue(new Error('private bot details'));
		await expect(openStarterPack({ eventUri })).rejects.toMatchObject({
			status: 503,
			body: { message: 'Couldn’t open the starter pack. Please try again.' }
		});
		log.mockRestore();
	});
});

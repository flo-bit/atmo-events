import { beforeEach, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { sqliteDatabase } from '@atmo-dev/notify/sqlite';
import { getNotifications } from './server';
import { GET, POST, PUT } from '../../routes/api/notify/[...path]/+server';

const alice = 'did:plc:alice';
const bob = 'did:plc:bob';
function request(
	path: string,
	did: string | null = alice,
	method = 'GET',
	body?: unknown,
	origin = 'https://atmo.rsvp'
) {
	return {
		request: new Request(`https://atmo.rsvp/api/notify/${path}`, {
			method,
			headers: { origin, 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		}),
		locals: { did }
	} as Parameters<typeof GET>[0];
}
beforeEach(() => {
	Object.assign(env, { NOTIFY_DB: sqliteDatabase() });
});

it('rejects signed-out requests without accessing bindings', async () => {
	Reflect.deleteProperty(env, 'NOTIFY_DB');
	const response = await GET(request('inbox', null));
	expect(response.status).toBe(401);
	expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('uses only the session DID for private inboxes and read operations', async () => {
	await GET(request('inbox'));
	await GET(request('inbox', bob));
	const notify = await getNotifications();
	const sent = await notify.send({ recipient: alice, category: 'change', title: 'Changed' });
	const response = await GET(request('inbox', bob));
	expect(await response.json()).toMatchObject({ items: [], unread: 0 });
	await POST(request('read', bob, 'POST', { ids: [sent.id], did: alice }));
	expect(await notify.unreadCount(alice)).toBe(1);
	expect(response.headers.get('cache-control')).toBe('private, no-store');
});
it('polls the unread badge without enrolling', async () => {
	const response = await GET(request('unread'));
	expect(await response.json()).toEqual({ unread: 0 });
	expect((await (await getNotifications()).enrolled([alice])).size).toBe(0);
});
it('persists delivery settings without requiring public record permissions', async () => {
	await GET(request('inbox'));
	const response = await PUT(
		request('preferences', alice, 'PUT', { category: 'change', channels: 'off' })
	);
	expect(response.status).toBe(200);
	const notify = await getNotifications();
	expect(
		await notify.send({ recipient: alice, category: 'change', title: 'Skipped' })
	).toMatchObject({ created: false });
	expect((await notify.getPreferences(bob)).find((p) => p.category === 'change')?.enabled).toBe(
		true
	);
});
it('rejects cross-origin writes', async () => {
	expect(
		(
			await PUT(
				request(
					'preferences',
					alice,
					'PUT',
					{ category: 'change', channels: 'off' },
					'https://evil.test'
				)
			)
		).status
	).toBe(403);
});
it('keeps in-app delivery working without VAPID and requires stable storage', async () => {
	expect((await GET(request('push'))).status).toBe(404);
	expect(await (await GET(request('preferences'))).json()).toMatchObject({ channels: [] });
	env.NOTIFY_DB = env.DB;
	await expect(getNotifications()).rejects.toThrow('stable NOTIFY_DB');
});

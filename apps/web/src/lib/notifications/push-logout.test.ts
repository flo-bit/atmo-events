import { afterEach, expect, it, vi } from 'vitest';
import { setDevicePush, signOutWithPush, syncPush } from './client.svelte';

afterEach(() => vi.unstubAllGlobals());

it('waits for a delayed browser subscription and detaches it before ending the session', async () => {
	const operations: string[] = [];
	const endpoint = 'https://fcm.googleapis.com/fcm/send/device';
	const requestPermission = vi.fn(async () => 'granted');
	vi.stubGlobal('window', { PushManager: {}, Notification: {} });
	vi.stubGlobal('Notification', { requestPermission });
	const subscribing = Promise.withResolvers<void>();
	const allowSubscription = Promise.withResolvers<void>();
	const subscription = {
		endpoint,
		toJSON: () => ({ endpoint }),
		unsubscribe: async () => {
			operations.push('unsubscribe');
			return true;
		}
	};
	let active = false;
	const pushManager = {
		async subscribe() {
			subscribing.resolve();
			await allowSubscription.promise;
			active = true;
			return subscription;
		},
		getSubscription: async () => (active ? subscription : null)
	};
	vi.stubGlobal('navigator', {
		serviceWorker: {
			ready: Promise.resolve({ pushManager }),
			getRegistration: async () => ({ pushManager })
		}
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			operations.push(init.method);
			return Response.json({ publicKey: 'AA' }, { status: init.method === 'DELETE' ? 503 : 200 });
		})
	);

	const enabling = setDevicePush(true);
	expect(requestPermission).toHaveBeenCalledOnce(); // still inside the click handler
	await subscribing.promise;
	const logout = vi.fn(async () => {
		operations.push('logout');
	});
	const signingOut = signOutWithPush(logout);
	expect(await syncPush()).toBe('off');
	expect(logout).not.toHaveBeenCalled();
	allowSubscription.resolve();
	await expect(enabling).resolves.toBe('on');
	await signingOut;
	expect(operations).toEqual(['GET', 'POST', 'unsubscribe', 'DELETE', 'logout']);
});

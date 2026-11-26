import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sync: vi.fn(), disable: vi.fn() }));
vi.mock('@atmo-dev/notify/client', () => ({ createNotifyClient: () => ({ push: mocks }) }));
import { signOutWithPush, syncPush } from './client.svelte';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

it('waits for in-flight sync and prevents a late page load from reattaching the device during logout', async () => {
	const calls: string[] = [];
	let finishSync!: (value: 'on') => void;
	let started!: () => void;
	const syncing = new Promise<void>((resolve) => {
		started = resolve;
	});
	mocks.sync.mockImplementation(() => {
		calls.push('sync');
		started();
		return new Promise<'on'>((resolve) => {
			finishSync = resolve;
		});
	});
	mocks.disable.mockImplementation(async () => {
		calls.push('disable');
	});
	vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn(async () => {}) } });
	const first = syncPush();
	await syncing;
	expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/service-worker.js', {
		type: 'module'
	});
	const logout = vi.fn(async () => {
		calls.push('logout');
	});
	const signingOut = signOutWithPush(logout);
	expect(await syncPush()).toBe('off');
	expect(logout).not.toHaveBeenCalled();
	finishSync('on');
	await first;
	await signingOut;
	expect(calls).toEqual(['sync', 'disable', 'logout']);
	expect(mocks.sync).toHaveBeenCalledOnce();
});

it('does not keep the user signed in when push cleanup fails', async () => {
	mocks.disable.mockRejectedValueOnce(new Error('Offline'));
	const logout = vi.fn(async () => {});
	await signOutWithPush(logout);
	expect(logout).toHaveBeenCalledOnce();
});

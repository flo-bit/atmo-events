import { createNotifyClient, type PushState } from '@atmo-dev/notify/client';

export const notifications = createNotifyClient();
export const notificationState = $state({ unread: 0 });

let pendingPush: Promise<PushState> | null = null;
let signingOut: Promise<void> | null = null;

function runPush(operation: () => Promise<PushState>, fromGesture = false) {
	if (signingOut) return Promise.resolve<PushState>('off');
	const previous = pendingPush;
	// Permission prompts must start inside the click, not after waiting for I/O.
	if (previous && fromGesture) return Promise.reject(new Error('Push setup is still in progress'));
	const next: Promise<PushState> = (
		previous
			? previous
					.catch(() => 'off' as const)
					.then(() => (signingOut ? ('off' as const) : operation()))
			: operation()
	).finally(() => {
		if (pendingPush === next) pendingPush = null;
	});
	pendingPush = next;
	return next;
}

/** Register without an offline cache: pages and sessions must always reach the server. */
export function syncPush() {
	return runPush(async () => {
		if ('serviceWorker' in navigator) {
			await navigator.serviceWorker.register('/service-worker.js', { type: 'module' });
		}
		return signingOut ? 'off' : notifications.push.sync();
	});
}

export function setDevicePush(enabled: boolean) {
	return enabled
		? runPush(() => notifications.push.enable(), true)
		: runPush(() => notifications.push.disable());
}

export function signOutWithPush(logout: () => Promise<void>) {
	if (signingOut) return signingOut;
	const previous = pendingPush;
	signingOut = Promise.resolve()
		.then(async () => {
			// A subscription can be created long after the permission prompt. Wait
			// for that attachment (even a failed one) before checking for the device.
			await previous?.catch(() => {});
			const cleanup = new AbortController();
			const timer = setTimeout(() => cleanup.abort(), 3000);
			try {
				await notifications.push.disable({ signal: cleanup.signal });
			} catch {
				// Best-effort cleanup must not prevent account sign-out.
			} finally {
				clearTimeout(timer);
			}
			await logout();
		})
		.finally(() => {
			signingOut = null;
		});
	return signingOut;
}

/** Read the count without allowing a stale session's response to update the UI. */
export async function refreshNotifications(enroll = false) {
	const result = await (enroll ? notifications.inbox({ limit: 1 }) : notifications.unread());
	return result.unread;
}

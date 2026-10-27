import { now as tidNow } from '@atcute/tid';

export function load() {
	return { pageTitle: 'Create Event', rkey: tidNow() };
}

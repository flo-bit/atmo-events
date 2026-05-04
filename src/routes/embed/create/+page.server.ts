import { now as tidNow } from '@atcute/tid';

export function load() {
	return { rkey: tidNow() };
}

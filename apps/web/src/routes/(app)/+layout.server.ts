import { privateEventsEnabled } from '#lib/private-events/server/enabled.js';

export function load(): { privateEventsEnabled?: boolean } {
	return { privateEventsEnabled: privateEventsEnabled() };
}

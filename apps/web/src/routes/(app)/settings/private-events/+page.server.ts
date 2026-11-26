import { error } from '@sveltejs/kit';
import { privateEventsEnabled } from '#lib/private-events/server/enabled.js';

export function load() {
	if (!privateEventsEnabled()) error(404, 'Not found');
	return { pageTitle: 'Private event settings' };
}

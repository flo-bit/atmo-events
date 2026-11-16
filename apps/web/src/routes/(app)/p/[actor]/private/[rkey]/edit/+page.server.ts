import { loadEditPage } from '#lib/private-events/server/event-page.js';

export function load(event) {
	return loadEditPage(event);
}

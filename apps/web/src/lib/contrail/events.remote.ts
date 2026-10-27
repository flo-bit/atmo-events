import { env } from 'cloudflare:workers';
import { command } from '$app/server';
import { listEventsInput, runLoadMoreEvents } from './events-load-more';

export const loadMoreEvents = command(listEventsInput, async (input) => {
	return runLoadMoreEvents(env, input);
});

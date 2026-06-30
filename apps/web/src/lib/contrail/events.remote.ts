import { command, getRequestEvent } from '$app/server';
import { listEventsInput, runLoadMoreEvents } from './events-load-more';

export const loadMoreEvents = command(listEventsInput, async (input) => {
	const { platform } = getRequestEvent();
	return runLoadMoreEvents(platform!.env, input);
});

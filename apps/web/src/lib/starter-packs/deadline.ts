/** Cooperative cancellation: no detached Promise.race or writes after a timeout. */
export async function withDeadline<T>(
	ms: number,
	parent: AbortSignal | undefined,
	run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const controller = new AbortController();
	const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
	const timer = setTimeout(
		() => controller.abort(new DOMException('Starter-pack time budget exceeded', 'TimeoutError')),
		ms
	);
	try {
		signal.throwIfAborted();
		const result = await run(signal);
		signal.throwIfAborted();
		return result;
	} finally {
		clearTimeout(timer);
		// Also stop sibling mention workers when one fails before the deadline.
		controller.abort();
	}
}

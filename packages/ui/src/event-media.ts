/** Select the event's thumbnail, falling back to a flyer before any header image. */
export function getEventThumbnail<T extends { role?: unknown }>(
	media: readonly T[] | null | undefined
): T | undefined {
	return media?.find((m) => m.role === 'thumbnail') ?? media?.find((m) => m.role === 'flyer');
}

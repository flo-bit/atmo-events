export function formatMonth(date: Date): string {
	return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

export function formatDay(date: Date): number {
	return date.getDate();
}

export function formatWeekday(date: Date): string {
	return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function formatFullDate(date: Date): string {
	const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
	if (date.getFullYear() !== new Date().getFullYear()) {
		options.year = 'numeric';
	}
	return date.toLocaleDateString('en-US', options);
}

export function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function validateLink(
	link: string | undefined,
	tryAdding: boolean = true
): string | undefined {
	if (!link) return;
	try {
		new URL(link);

		return link;
	} catch {
		if (!tryAdding) return;

		try {
			link = 'https://' + link;
			new URL(link);

			return link;
		} catch {
			return;
		}
	}
}

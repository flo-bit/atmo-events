/**
 * Timezone utilities for the scheduling flow.
 *
 * Key invariant: all stored slot times are UTC ISO strings.
 * Conversion to/from local timezones happens only at the UI boundary.
 *
 * Flow:
 * 1. Organizer defines a date range + time window in their timezone (e.g., "Apr 15-20, 9am-5pm Chicago")
 * 2. We generate all 30-min slot starts as UTC timestamps
 * 3. Each participant's grid shows these slots labeled in their local timezone
 * 4. Selections are stored/compared as UTC — no timezone math at query time
 * 5. Results display in the organizer's timezone
 */

/**
 * Generate all slot start times (UTC) for a scheduling request.
 * The date range and time window are interpreted in the organizer's timezone.
 */
export function generateSlots(
	dateStart: string,
	dateEnd: string,
	timeStart: string,
	timeEnd: string,
	organizerTz: string,
	slotMinutes: number = 30
): string[] {
	const slots: string[] = [];
	const [startH, startM] = timeStart.split(':').map(Number);
	const [endH, endM] = timeEnd.split(':').map(Number);

	// iterate each day in the range
	const start = new Date(dateStart + 'T00:00:00');
	const end = new Date(dateEnd + 'T00:00:00');

	for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

		// generate slots for this day's time window
		let slotH = startH;
		let slotM = startM;

		while (slotH < endH || (slotH === endH && slotM < endM)) {
			// build wall-clock time in organizer's timezone, then convert to UTC
			const wallClock = `${dateStr}T${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}:00`;
			const utc = wallClockToUtc(wallClock, organizerTz);
			slots.push(utc);

			// advance by slot duration
			slotM += slotMinutes;
			if (slotM >= 60) {
				slotH += Math.floor(slotM / 60);
				slotM = slotM % 60;
			}
		}
	}

	return slots;
}

/**
 * Convert a wall-clock datetime string (no timezone) to a UTC ISO string,
 * interpreting the input as being in the given IANA timezone.
 *
 * Uses iterative offset probing to handle DST transitions correctly:
 * the offset at the initial guess may differ from the offset at the
 * actual target time, so we refine once to converge.
 */
function wallClockToUtc(wallClock: string, timezone: string): string {
	const [datePart, timePart] = wallClock.split('T');
	const [year, month, day] = datePart.split('-').map(Number);
	const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number);

	const targetMs = Date.UTC(year, month - 1, day, hour, minute, second || 0);

	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});

	function getOffsetMs(utcMs: number): number {
		const parts = formatter.formatToParts(new Date(utcMs));
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
		const h = get('hour') === 24 ? 0 : get('hour');
		const localMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), 0);
		return localMs - utcMs;
	}

	// first pass: estimate UTC from offset at the naive guess
	const offset1 = getOffsetMs(targetMs);
	const guess1 = targetMs - offset1;

	// second pass: refine using offset at the first estimate
	// (handles DST transitions where offset differs at guess vs target)
	const offset2 = getOffsetMs(guess1);
	const result = targetMs - offset2;

	return new Date(result).toISOString();
}

/**
 * Convert a UTC ISO string to a wall-clock datetime in a given timezone.
 * Returns { date: "YYYY-MM-DD", time: "HH:mm", dayOfWeek: "Mon" }
 */
export function utcToLocal(
	utcIso: string,
	timezone: string
): { date: string; time: string; dayOfWeek: string } {
	const d = new Date(utcIso);

	const dateFmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});

	const timeFmt = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});

	const dayFmt = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		weekday: 'short'
	});

	return {
		date: dateFmt.format(d),
		time: timeFmt.format(d),
		dayOfWeek: dayFmt.format(d)
	};
}

/**
 * Format a UTC ISO string as a human-readable date/time in a timezone.
 * e.g., "Mon, Apr 15 at 9:00 AM"
 */
export function formatSlotInTz(utcIso: string, timezone: string): string {
	const d = new Date(utcIso);
	return new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	}).format(d);
}

/**
 * Get the short timezone label (e.g., "CDT", "EST") for a timezone at a given moment.
 */
export function getTimezoneAbbr(timezone: string, atDate?: Date): string {
	const d = atDate ?? new Date();
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		timeZoneName: 'short'
	}).formatToParts(d);
	return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
}

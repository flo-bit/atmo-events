<script lang="ts">
	/**
	 * Renders every location declared on an event.
	 *
	 * `community.lexicon.calendar.event#main.locations` is a union of five
	 * different shapes (a plain `uri`, an `address`, a Foursquare `fsq`, a `geo`
	 * coordinate pair, and an `hthree` cell). Previously only the `address`
	 * variant was shown, so events that used any other shape displayed no
	 * location at all. This component formats and lists every variant so all
	 * locations are visible.
	 */
	let { locations = [] }: { locations?: unknown[] } = $props();

	function asRecord(value: unknown): Record<string, unknown> | null {
		return typeof value === 'object' && value !== null
			? (value as Record<string, unknown>)
			: null;
	}

	function stringField(record: Record<string, unknown>, key: string): string | undefined {
		const v = record[key];
		return typeof v === 'string' && v.length > 0 ? v : undefined;
	}

	function formatAddress(record: Record<string, unknown>): string {
		const parts: string[] = [];
		const name = stringField(record, 'name');
		if (name) parts.push(name);
		const street = stringField(record, 'street');
		if (street) parts.push(street);
		const city = [stringField(record, 'locality'), stringField(record, 'region')]
			.filter(Boolean)
			.join(', ');
		if (city) parts.push(city);
		const tail = [stringField(record, 'postalCode'), stringField(record, 'country')]
			.filter(Boolean)
			.join(' ');
		if (tail) parts.push(tail);
		return parts.join(', ');
	}

	function formatLocation(value: unknown): string {
		const record = asRecord(value);
		if (!record) return '';

		// community.lexicon.location.address: a street address.
		if (typeof record.country === 'string') return formatAddress(record);

		// community.lexicon.location.geo: a lat/lng coordinate pair.
		if (typeof record.lat === 'number' && typeof record.lng === 'number') {
			const lat = record.lat as number;
			const lng = record.lng as number;
			return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
		}

		// community.lexicon.location.hthree: an H3 cell.
		if (typeof record.cell === 'string') return record.cell;

		// community.lexicon.calendar.event#uri: a linked URI.
		if (typeof record.uri === 'string') {
			return stringField(record, 'name') ?? record.uri;
		}

		// community.lexicon.location.fsq: a Foursquare venue.
		const fsqName = stringField(record, 'name');
		const fsqFid = stringField(record, 'fid');
		if (fsqName || fsqFid) return fsqName ?? fsqFid ?? 'Foursquare';

		return '';
	}

	$: lines = locations.map((location) => formatLocation(location)).filter((line) => line.length > 0);
</script>

{#if lines.length > 0}
	<ul class="event-locations">
		{#each lines as line, index (index)}
			<li class="event-locations__item">{line}</li>
		{/each}
	</ul>
{/if}

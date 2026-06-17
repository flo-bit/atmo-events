// Input contract for the geocode remote command. Pure module (no server-only
// imports) so production validation is directly testable.
import * as v from 'valibot';

/** Generous for any address; small enough to not relay arbitrary payloads. */
export const MAX_GEOCODE_QUERY_LENGTH = 200;

export const geocodeInput = v.object({
	q: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1),
		v.maxLength(MAX_GEOCODE_QUERY_LENGTH)
	)
});

export type GeocodeInput = v.InferOutput<typeof geocodeInput>;

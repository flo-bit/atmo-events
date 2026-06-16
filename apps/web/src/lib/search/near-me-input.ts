// Input bounds for the near-me query. Pure valibot module (no $app/server)
// so the schema — the validation that actually runs in production — stays
// directly testable.
import * as v from 'valibot';

/** Server-side abuse bound; the UI offers fixed radii well under this. */
export const MAX_NEAR_ME_RADIUS_METERS = 500_000;

export const nearMeInput = v.object({
	lat: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
	lng: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
	radiusMeters: v.pipe(v.number(), v.minValue(1), v.maxValue(MAX_NEAR_ME_RADIUS_METERS)),
	cursor: v.optional(v.string())
});

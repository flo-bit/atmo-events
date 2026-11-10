# Nearby events

## User-facing behavior

`/cities` shows **upcoming events in one city**, not a combined radius feed.

- A city explicitly selected in the picker takes precedence over Cloudflare's approximate IP location. The selected city is remembered on this device for 90 days in an HttpOnly, SameSite=Lax cookie scoped to `/cities`. The picker changes this preference; browser settings can clear it. Neither the IP coordinates nor this preference is published to ATProto. Selection links disable SvelteKit data preloading so hovering never changes the preference.
- Without a usable location, show the searchable picker. Its initial suggestions are event cities, ranked by snapshot event count. Suggestions update as you type, using a debounced server lookup; searches also include the bundled GeoNames cities. Arrow keys and Enter select a suggestion. Exact names rank before prefixes within the gazetteer; known event cities remain preferred.
- Show the matched city's live upcoming events first. If it has no live results and no continuation, check at most five other city candidates, ordered by approximate straight-line distance, within **100 km**. Borders do not restrict proximity. Stop at the first candidate with results or a continuation.
- A continuation on an empty page means there are still candidates to check, not that the city is empty. Retain “Load more”.
- If none of the bounded candidates qualify, show an empty state and let the user choose another city. Do not call a distant city “nearby.” Distances are approximate, not travel distances.
- Virtual and cancelled events are excluded; hybrid events qualify. Events already underway are not included: this is explicitly an **upcoming** list.

## ATProto data and location confidence

The source of truth is each author's published record. Contrail supplies the app's local projection of those records. This feature never rewrites publisher records or promises complete/instantaneous network coverage.

City normalization preserves the original labels/address variants and uses derived lookup keys for country/region equivalences and a small explicit set of country-scoped city aliases. Unknown names are not fuzzily merged. The bundled GeoNames primary/ASCII names also support coordinate lookups. It is not an exhaustive multilingual geocoder and many small towns are absent.

Automatic matching may bridge a missing region only when the gazetteer can resolve the city unambiguously. A single regionless Springfield in the event catalog is not proof of which Springfield the visitor means. Explicit catalog choices can still browse incomplete addresses, including a missing country, without inventing a location for distance calculations.

Distance calculations prefer a uniquely resolved city center. Otherwise, an event-derived point is usable only when its record has one address and one valid geo/precise H3 location. Conflicting event points are rejected. Publisher coordinates remain untrusted assertions, and IP geolocation can be wrong (VPNs, mobile networks, etc.); the picker is always available.

## Freshness, pagination and cost

- The existing authenticated cron runs every minute. A persisted lease allows only one global city rebuild per **15-minute interval**, not one rebuild per visitor or edge location.
- A rebuild scans the indexed event records, groups normalized cities and publishes immutable city memberships atomically. New events normally appear within one interval **after ingestion**, plus up to one minute of edge head-cache lag. Network ingestion and failed cron jobs can add delay.
- The new definition is `cities:v4`. The next successful cron rebuild upgrades it automatically; no publisher migration or external geocoding is required. Before that initial rebuild, the page reports temporary unavailability rather than scanning events during a production request.
- SQL compares timestamps as instants using `julianday`; snapshot ordering stores UTC-normalized times. Author records retain their original timestamps and offsets.
- Hydration checks current timestamps, cancellation, discovery preference, physical location, and moderation visibility by primary key. An old snapshot timestamp must not prefilter an event that has since been rescheduled. New/moved-in memberships and revised ordering still wait for a rebuild.
- Pages contain up to 20 events and check at most 60 record candidates per city request. Old snapshot IDs keep an in-flight walk stable. Snapshots are retained in D1 for 24 hours, independently of the rebuild interval; expired cursors end rather than silently restarting.
- Only global catalog/membership data uses the shared edge cache. The personalized page is `private, no-store`.

The 15-minute interval trades additional background work/storage for usable freshness. It means up to 96 published snapshots per day instead of one. Monitor D1 reads/writes, snapshot age (`city_snapshot_state.updated_at`), and `[cron] refreshCitySnapshot failed` logs as the corpus grows. An incremental city index is a future optimization, not part of this change.

## Validation and PR checklist

```sh
pnpm --filter web check
pnpm --filter web exec vitest run src/lib/server/cities.test.ts src/lib/server/city-gazetteer.test.ts src/lib/server/city-normalization.test.ts src/lib/contrail/cities-integration.test.ts 'src/routes/(app)/cities'
pnpm --filter web exec vitest run --config vitest.browser.config.ts 'src/routes/(app)/cities/page.browser.spec.ts'
pnpm --filter web build
```

Regression coverage includes offset timestamps, cancellation, rescheduling, periodic freshness and immutable cursors, missing/ambiguous regions, scoped name aliases, incomplete-address picker selections, bounded cross-border candidates, stale fallback cities, preference cookies and private caching.

After deployment, verify a successful v4 snapshot, an IP-detected visit (including a VPN/missing-location case), live city suggestions, selecting and remembering a city, fallback distance/empty states, and pagination. Local geolocation alone is not proof that production Cloudflare metadata is available.

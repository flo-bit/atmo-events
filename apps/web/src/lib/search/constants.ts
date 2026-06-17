// Shared sizing for the Meilisearch-backed search read path.
// Pure constants — imported by both server modules and contrail.config.ts
// (which the contrail-lex CLI also loads, so no server-only deps here).

export const SEARCH_PAGE_SIZE = 20;

/** Meili hits fetched per page request: hydration via D1 drops hits this
 *  instance never ingested (e.g. foreign-network docs in a shared index), so
 *  we overfetch to keep pages full without re-querying. */
export const SEARCH_OVERFETCH = 3;

/** Upper bound on uris accepted by the listDiscoverableByUris hydration
 *  endpoint — the overfetch budget is the only legitimate caller volume, and
 *  60 (+1 pipeline LIMIT bind) stays far under D1's 100-bound-param limit. */
export const MAX_HYDRATION_URIS = SEARCH_PAGE_SIZE * SEARCH_OVERFETCH;

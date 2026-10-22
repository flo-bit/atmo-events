# Event OG-image cost containment

The public URL remains `/p/[actor]/e/[rkey]/og.png`. Both blur effects are unchanged.

## Request flow

1. Resolve the actor and read the current public event from Contrail/D1.
2. Compute a SHA-256 version from template version, DID, rkey, and event CID. When CID is absent, use all image-dependent content instead. Handle/DID aliases share stored images.
3. A matching event ETag returns 304 without rendering. HEAD never generates an image.
4. Read immutable versioned PNG bytes from the local edge cache, then R2.
5. On a miss, coalesce locally and atomically claim a **global** quota slot and per-image lease using D1 `batch()`. A different isolate with an active lease serves a short-lived static preview rather than duplicating rendering.
6. Recheck R2, generate if still missing, consume the complete PNG stream, and **await R2 PUT before responding/releasing the lease**. PNG payloads are capped at 2 MiB. Remote thumbnails have a 5-second deadline and 2 MiB cap; title layout input is limited to 280 UTF-16 code units.
7. Missing bindings/schema, denied quota, thumbnail/render failures, and R2 errors serve the existing `/og.png`. There is **no uncapped rendering bypass**, including in local development.

The public event image retains `max-age=300, s-maxage=3600, stale-while-revalidate=86400`. The internal versioned edge entry has a 24-hour TTL. Static fallbacks have a 60-second TTL and **no event ETag**. Social platforms may maintain their own caches beyond these headers.

## Rendering

Cards are rendered by [Takumi](https://takumi.kane.tw) (`@takumi-rs/wasm` + `@takumi-rs/helpers`, both pinned to an exact version) in `takumi.ts`. The template is Svelte SSR markup; Tailwind classes are mapped to Takumi's `tw` attribute. Images are passed to the renderer as raw bytes keyed by short placeholder `src` values, never inlined as base64 (the previous Satori pipeline's HTML parser was superlinear in markup length, and large inline thumbnails exceeded the 30 s Worker CPU limit, dying silently).

- **Thumbnails:** JPEG `feed_thumbnail` (≤1000px) for the card, the 128px `avatar_thumbnail` for the backdrop, blurred natively.
- **No thumbnail:** the generated avatar SVG is rasterized once at 128px and stretched for both the backdrop and the card. Its built-in SVG blur costs ~10× more at card size.
- **Memory:** a renderer keeps every distinct SVG it rasterizes, so `withOgRenderer` creates a fresh one per card and frees it. The exported `Renderer` ignores constructor options, so its cache can't be disabled instead.
- **Untrusted text:** keep event text out of HTML attributes. Takumi's parser ends a tag at the first `>` even inside quotes, and Svelte doesn't escape `>` in attribute values. `template.test.ts` guards this.
- **Text:** HTML characters (`&`, `<`, quotes) render as typed. Noto Sans covers Latin, Greek and Cyrillic. Emoji become Twemoji SVGs (jsDelivr), fetched with the thumbnail bounds, at most 16 per card. An emoji Twemoji doesn't have (404) is left blank; any other failure fails the render, so the static fallback is served and a later request retries rather than storing a card with a missing emoji. CJK, Arabic and other scripts have no font and render as boxes (as with the old renderer); about 30 of ~93,000 event names are affected.
- **Loading:** in workerd the WASM is imported as a module (`takumi-wasm.workerd.ts`, emitted by `unwasm` in `vite.config.ts`); in Node (dev, tests) it is read from the package.

Locally, a card takes ~60–90 ms CPU warm and ~0.2–0.3 s cold, down from ~1.3–1.9 s with Satori.

## Quotas and failure handling

Configured in `wrangler.jsonc`:

- `OG_DAILY_GENERATION_LIMIT=200` (UTC day).
- `OG_CYCLE_GENERATION_LIMIT=3000` (billing cycle, not calendar month).
- `OG_BILLING_CYCLE_START_DAY=13` (UTC; supported range 1–28).

Attempts, including failed rendering/PUTs, consume quota. Set either limit to `0` to disable **new generation**, while keeping cached images available. Invalid settings fail closed. Do not reset/delete the budget row in production or during deployment; the schema setup is idempotent and preserves counters.

At an estimated 0.2–0.8 s CPU per Takumi render (measured locally; check production analytics), 3,000 attempts correspond to roughly 0.6–2.4 million CPU-ms (2–8% of the 30M monthly allowance). Real demand was ~40 new cards/day in October 2026. This is an attempt limit, **not a CPU/billing cap**. Requests, actor resolution, D1/R2 operations and other account workloads still count. The 10-minute lease prevents ordinary concurrent generation and backs off crashed/failed attempts; expired leases allow recovery. A render exceeding that lease can overlap a retry, but both still consume global quota. Successful admissions prune expired leases; denied distinct URLs do not insert lease rows.

## Storage and fonts

R2 keys are `og/v3/<sha256>.png`. Increase `OG_TEMPLATE_VERSION` in `cache.ts` after any template/font/formatting/selection change. Event edits create new keys; public URLs are deliberately **not immutable**.

Use a dedicated **private Standard** bucket, `atmo-events-og-images`, with the checked-in 90-day `og/` expiration policy. This retains old versions only for a bounded period. Expired images regenerate only within quota. Cards average ~150–350 KB (capped at 2 MiB), so a fully used 3,000-render cycle is ~1 GB and 90 days of retention ~3 GB, within R2's 10 GB allowance shared with other buckets; lifecycle deletion is not instantaneous. R2 operations remain metered. Do not attach this policy to Alluvium or other application-data buckets.

The bundled Noto Sans regular/bold fonts are registered with each renderer. `fonts.ts` decodes the inline assets once per isolate; no font requests are needed in production. Source: `https://cdn-sveltekit-og.ethercorps.io/NotoSans-{Regular,Bold}.ttf`. Their SIL Open Font License is in `fonts/LICENSE`.

## Infrastructure setup after review

No resources or production code were changed while preparing this implementation. `cf` read-only inspection confirmed the bucket and budget tables do not yet exist. Authenticate/select the intended Cloudflare account locally; never paste credentials.

Run from `apps/web/`. Preview the requests first:

```sh
cf r2 buckets create --name atmo-events-og-images --storage-class Standard --dry-run
cf r2 buckets lifecycle update atmo-events-og-images --body="$(node -p "require('node:fs').readFileSync('scripts/og-cache-lifecycle.json', 'utf8')")" --dry-run
cf d1 query 3f862040-84ee-4216-8ba7-ef3146058de4 --sql="$(node -p "require('node:fs').readFileSync('scripts/og-cache-schema.sql', 'utf8')")" --dry-run
```

After approving the previews, run the same commands without `--dry-run`. The lifecycle command replaces the bucket's entire policy: the checked-in policy includes multipart-upload cleanup and must only be applied to this dedicated bucket. If the bucket already exists, inspect its current rules before replacing them. Apply the D1 schema before deploying the Worker.

This project still uses Wrangler configuration. Cloudflare's cf documentation says resource commands work alongside Wrangler, but `cf build/dev/deploy` require a separate config migration. Do not implicitly migrate as part of this feature. Deployment after review:

```sh
pnpm build
pnpm exec wrangler deploy
```

For local app development, initialize the local DB with `scripts/og-cache-schema.sql` (for example, `pnpm exec wrangler d1 execute atmo-events-v5 --local --file scripts/og-cache-schema.sql`). An unavailable local R2 binding serves the static preview. The tests use transactional SQLite and in-memory R2 adapters without changing remote resources.

## Verification

```sh
pnpm exec vitest run src/lib/server/og 'src/routes/(app)/p/[actor]/e/[rkey]/og.png/server.test.ts'
pnpm check
pnpm build
```

Tests cover full PNG consumption/signature/dimensions, repeat reads, conditional GET, HEAD, changed event versions, local and global concurrency, many distinct misses, UTC daily/cycle rollover, atomic transaction rollback, failure cooldowns, disabled/missing infrastructure and internal-vs-public cache headers.

After deployment, test real requests at multiple Cloudflare locations and inspect D1 counters and several complete UTC days of account CPU/R2/request usage. Cached social previews must remain usable after quotas are exhausted. Existing event pages and cron behavior are unchanged.

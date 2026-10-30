# Legal pages

The app shell renders one shared Kit `LegalFooter` on app pages, not embeds.
It has five links: Terms (`/terms`), Privacy (`/privacy`), Imprint (`/imprint`),
Report, and Source. Community rules, reporting, and appeals are included in Terms;
there is no separate moderation page.
All links are individually optional: edit `legalFooterLinks` in
`apps/web/src/lib/legal/config.ts`, omitting a key or setting it to `false` to hide it.
The report setting also controls contextual report buttons on events/profiles.
Those routes supply `reportSubject`; other pages offer the configured email link.

## Current status: unpublished drafts

The routes are implemented for review, **not approved production policies**.
All three snapshots retain internal draft status and use `noindex, nofollow`.
No draft label is shown on the pages, and no revision date is invented. The operator postal address, actual
retention/deletion arrangements, legal bases, processor/transfer details, browser
storage and embed behavior, audience/terms, and operational notice/appeal
procedures need confirmation and review. See `legalReviewNeeded` in the config.
The configured contact is `reports@atmo.social`; verify the mailbox is operational.
Do not deploy these drafts as if they were final legal notices or acceptance terms.

## Authoring and revision workflow

1. Edit authoring facts in `apps/web/src/lib/legal/config.ts`. Shared operator facts
   may later come from an operator-owned module; do not publish personal facts as Kit defaults.
2. `pnpm --filter web legal:draft` prints candidate JSON to stdout and review notes
   to stderr. It intentionally never overwrites the saved documents. To capture
   candidates: `pnpm --filter web exec tsx scripts/generate-legal.ts > /tmp/rsvp-legal-drafts.json`.
3. Review candidate wording against deployed behavior. Edit and commit the app-owned
   `apps/web/src/lib/legal/documents.json` snapshot. Kit upgrades cannot silently
   regenerate it. Keep old revisions in Git and provide any required notices/acceptance.
4. Complete the operator information and review the final terms and privacy text.
   Set each document's `status` to `published` and its own reviewed `updated` date.
5. Run `pnpm --filter web legal:check` before publication. It deliberately fails for
   the current drafts/missing postal address. Passing checks completeness only,
   not legal approval. Update source config and snapshots together.

Kit's framework-free authoring helpers come from `@atmo-dev/kit/legal`; rendering
uses `LegalDocument` and `LegalFooter` from the main entry. The app owns routes,
page/social titles, draft indexing, auth, contact channels, and enforcement.
The new Kit APIs are currently available through the local Kit override. Publish
Kit and adopt its registry release before merging/deploying the consumer change.

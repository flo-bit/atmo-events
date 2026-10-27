# Local kit development

## Default: published packages

`apps/web` and `packages/ui` depend on `@atmo-dev/kit@0.0.2`. The event UI also declares a compatible kit peer dependency. A normal `corepack pnpm install --frozen-lockfile` uses npm and needs no sibling repository. CI follows this path; it never selects a local checkout automatically.

Use Corepack in RSVP so commands run its pinned pnpm version rather than a different global pnpm.

## Work on kit and app together

The default checkout layout is:

```text
11-atproto/
  00-atmo-kit/kit/
  02-atmo-rsvp/
```

In the kit directory, install its dependencies and build/watch the library:

```sh
pnpm install
pnpm exec svelte-package --watch
```

Once the initial build has finished, in RSVP:

```sh
corepack pnpm kit:local
corepack pnpm dev
```

The local install overrides the kit for the entire workspace, including both the web app and event UI. Imports still use `@atmo-dev/kit` and its packaged `dist` exports. Component, type, theme, and asset changes are rebuilt by the kit watcher. Vite's filesystem allowance follows the installed kit's actual location, including its font assets; existing Svelte deduplication remains enabled.

For another checkout, point at its package directory, not its parent:

```sh
ATMO_KIT_PATH=/path/to/atmo-kit corepack pnpm kit:local
```

Relative paths resolve from the app repository root. Missing, incorrectly named, or unbuilt checkouts produce an error instead of silently falling back to npm.

## Return to the published version

```sh
corepack pnpm kit:registry
```

Restart the dev server when changing modes. A normal frozen install also restores registry dependencies, so rerun `kit:local` after reinstalling if needed. Local mode lives only in `node_modules`, not in a saved preference or a global link.

RSVP disables pnpm 11's automatic pre-script dependency install (`verifyDepsBeforeRun: false`); otherwise a subsequent `pnpm dev` could silently undo local mode. Dependency installs stay explicit, including CI's frozen install. Apps using pnpm 11 should keep this setting when reusing the helper.

The explicit local pnpm hook reads the existing lockfile but disables saving it. This preserves locked versions of unrelated dependencies, unlike `--no-lockfile`. It changes neither package manifests nor workspace configuration; the wrapper also checks that the wanted lockfile stays byte-for-byte unchanged. Both the command and hook refuse local mode in CI.

## Release order

1. Develop and test kit/app changes locally.
2. Add a kit changeset and release the kit through its release PR.
3. Update the app's kit dependency, the event UI peer range, and the registry lockfile. Caret ranges on `0.0.x` do not automatically accept the next patch.
4. Run `kit:registry`, then the app checks/tests/build before merging.

An app PR that requires unpublished kit APIs will not pass registry-based CI until the kit release and dependency update are available. Do not work around that by making CI check out the kit's main branch.

## Reuse in other apps

The helper uses Node built-ins and pnpm, with no new dependencies. Copy `scripts/kit-dev.mjs`, `scripts/kit-local.pnpmfile.cjs`, and their integration test; add the same `kit:local`, `kit:registry`, and `test:kit-dev` scripts. Keep published kit dependencies in that app's manifests. If an app already has a pnpm hook, compose it with this explicit local hook rather than replacing its behavior.

The offline integration tests cover a packed dependency, two workspace consumers, live local dist edits, custom paths, missing builds, CI rejection, and switching back without editing manifests/config/lockfile. Run `corepack pnpm test:kit-dev`; `KIT_DEV_TEST_PNPM` can select another pnpm executable for compatibility testing. The helper is tested with RSVP's pnpm 11.2.2 and Watch's pnpm 10.30.1. Watch's existing `dev:local` API switch is independent of these kit commands.

# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).
It tracks pending version bumps + changelog entries for the publishable packages
in this monorepo (currently only `@atmo-dev/events-ui`).

## Adding a changeset

When you make a change to a published package, run:

```sh
pnpm changeset
```

Pick the package(s), the bump type (patch / minor / major), and write a short
summary. This creates a markdown file in `.changeset/` — commit it alongside your
change (on `main`).

## Releasing

Releases happen from `main` via GitHub Actions
(`.github/workflows/release.yml`):

1. Merge your changes (including the `.changeset/*.md` files) into `main`.
2. The release workflow opens a **"Version Packages"** PR that consumes the
   changesets, bumps versions, and updates changelogs.
3. Merge that PR → the workflow runs again and publishes to npm (tokenless,
   via OIDC).

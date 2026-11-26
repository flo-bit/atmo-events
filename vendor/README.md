# Temporary notification package snapshot

This is a package-manager tarball, not copied application UI or an alternate
library implementation. It lets this unpublished feature branch install
reproducibly without absolute local dependency paths or publishing a release
during development.

- `notify-0.0.1.tgz`: `@atmo-dev/notify` 0.0.1 from the `44-atmo-notify/atmo-notify`
  workspace, including enrollment, snapshot helpers, browser/SW helpers and
  account-safe delivery retries.

`@atmo-dev/kit` (`0.22.0`) is installed from the npm registry.

The tarball retains its upstream license and contains built package files only,
no application secrets, local database contents or dependencies. `pnpm-lock.yaml`
pins its integrity. It is temporary: replace the `file:` reference in
`apps/web/package.json` with a published version and remove the tarball once
`@atmo-dev/notify` is released.

## Refresh after library changes

From the notify workspace:

```sh
pnpm --filter @atmo-dev/notify build
pnpm --filter @atmo-dev/notify pack --pack-destination /tmp/notification-pack
```

Copy the resulting archive to `notify-0.0.1.tgz` here. Reinstall from the RSVP
root and refresh the lockfile integrity when replacing the archive. Confirm
`pnpm install --frozen-lockfile`, checks, tests and the production build before
handing off. Never substitute a local link and commit its machine-specific path.

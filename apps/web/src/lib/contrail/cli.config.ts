import type { ContrailConfig } from '@atmo-dev/contrail';
import { variables } from '../../env';
import { contrailNetworkOf, type NetworkSettings } from '../atproto/network-settings';
import { config as appConfig } from '../contrail.config';

// What contrail's own CLI loads (`pnpm backfill`), outside SvelteKit. The Worker adds the
// network from $app/env/public (contrail/index.ts); the CLI has no $app, so it reads the same
// settings from the shell's environment. Without them a backfill reads the public network, so
// run it where they are set: `pnpm e2e:backfill` runs it with the test network's. Settings kept
// only in apps/web/.env reach it only through `pnpm backfill:local`, which reads them as the dev
// server does (scripts/backfill-local.mjs); plain and remote backfills never read .env.

/** The network settings in a raw env, checked as src/env.ts checks them. */
export function networkSettingsFrom(env: Record<string, unknown>): NetworkSettings {
	const settings: Record<string, unknown> = {};
	for (const [name, variable] of Object.entries(variables)) {
		const raw = env[name];
		const result = variable.schema['~standard'].validate(typeof raw === 'string' ? raw : undefined);
		if (result instanceof Promise) throw new Error(`${name}: checked asynchronously`);
		if (result.issues) {
			throw new Error(`${name}: ${result.issues.map((issue) => issue.message).join('; ')}`);
		}
		settings[name] = result.value;
	}
	return settings as NetworkSettings;
}

export const config: ContrailConfig = {
	...appConfig,
	...contrailNetworkOf(networkSettingsFrom(process.env))
};

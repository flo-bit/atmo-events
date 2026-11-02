// `pnpm backfill:local`: contrail's backfill into the local database the dev server uses, from the
// network the dev server uses. It reads LOCAL_STATE_DIR and the network settings as the dev server
// does, from the shell or apps/web/.env, so it also finds a database LOCAL_STATE_DIR keeps outside
// .wrangler/state (snowglobe.yml does, for the test network). contrail's CLI opens local D1 only in
// .wrangler/state, but it can write a SQLite file, and local D1 keeps each database in one: this
// hands it that file. Arguments go on to `contrail backfill`.
import { spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

/** The SQLite file local D1 keeps a database in, under a state directory (wrangler's
 * --persist-to). workerd names a Durable Object's file by its ID, and local D1 takes the ID from
 * the database's ID (localDatabaseId) as a name in the namespace `miniflare-D1DatabaseObject`. */
export function localD1File(stateDir, databaseId) {
	const key = createHash('sha256').update('miniflare-D1DatabaseObject').digest();
	const head = createHmac('sha256', key).update(databaseId).digest().subarray(0, 16);
	const tail = createHmac('sha256', key).update(head).digest().subarray(0, 16);
	const id = Buffer.concat([head, tail]).toString('hex');
	return join(stateDir, 'v3', 'd1', 'miniflare-D1DatabaseObject', `${id}.sqlite`);
}

/** The ID local D1 keeps a wrangler.jsonc database under: in local dev, wrangler uses
 * preview_database_id when there is one. */
export function localDatabaseId(database) {
	return database.preview_database_id ?? database.database_id;
}

/** LOCAL_STATE_DIR and the network settings as the dev server reads them (vite.config.ts and
 * src/env.ts): from the shell, else from .env in `directory`. Nothing else, since .env also holds
 * the Worker's secrets. */
export function devServerEnv(directory = process.cwd()) {
	return loadEnv('development', directory, ['LOCAL_STATE_DIR', 'PUBLIC_']);
}

/** contrail's CLI script, to run with this node: its bin shim needs a shell on Windows. */
export function contrailCli() {
	let directory = dirname(fileURLToPath(import.meta.resolve('@atmo-dev/contrail')));
	for (;;) {
		const manifest = join(directory, 'package.json');
		if (existsSync(manifest)) {
			const { name, bin } = JSON.parse(readFileSync(manifest, 'utf8'));
			if (name === '@atmo-dev/contrail') {
				return join(directory, typeof bin === 'string' ? bin : bin.contrail);
			}
		}
		if (dirname(directory) === directory) throw new Error('@atmo-dev/contrail has no package.json');
		directory = dirname(directory);
	}
}

async function main() {
	const { unstable_readConfig } = await import('wrangler');
	const database = unstable_readConfig({}).d1_databases.find((db) => db.binding === 'DB');
	if (!database || !localDatabaseId(database)) {
		throw new Error('wrangler.jsonc has no D1 database bound as DB');
	}
	const env = devServerEnv();
	const stateDir = env.LOCAL_STATE_DIR || '.wrangler/state';
	const file = localD1File(resolve(stateDir), localDatabaseId(database));
	// Only the dev server creates the file the way local D1 expects it.
	if (!existsSync(file)) {
		console.error(`No local database in ${stateDir} yet: start atmo there once first.`);
		process.exit(1);
	}
	console.log(`backfill: writing ${file}`);
	const config = 'src/lib/contrail/cli.config.ts';
	const args = ['backfill', '--config', config, '--sqlite', file, ...process.argv.slice(2)];
	// contrail's config reads the network settings from its environment (cli.config.ts).
	const result = spawnSync(process.execPath, [contrailCli(), ...args], {
		stdio: 'inherit',
		env: { ...process.env, ...env }
	});
	if (result.error) {
		console.error(`backfill: could not run contrail: ${result.error.message}`);
		process.exit(1);
	}
	process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main();
}

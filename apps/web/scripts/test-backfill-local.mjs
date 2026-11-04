import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { getPlatformProxy } from 'wrangler';
import { contrailCli, devServerEnv, localD1File, localDatabaseId } from './backfill-local.mjs';

/** Writes `database` as the only D1 binding of a throwaway Worker, and has local D1 create it. */
async function createLocalD1(t, database) {
	const directory = await mkdtemp(join(tmpdir(), 'atmo-local-d1-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const configPath = join(directory, 'wrangler.json');
	await writeFile(
		configPath,
		JSON.stringify({
			name: 'local-d1-test',
			compatibility_date: '2025-12-25',
			d1_databases: [{ binding: 'DB', database_name: 'local-d1-test', ...database }]
		})
	);
	const stateDir = join(directory, 'state');
	const { env, dispose } = await getPlatformProxy({
		configPath,
		persist: { path: join(stateDir, 'v3') }
	});
	try {
		await env.DB.prepare('CREATE TABLE marker (id INTEGER)').run();
	} finally {
		await dispose();
	}
	return stateDir;
}

// The file name copies how workerd names a Durable Object's storage, so check it against the
// file local D1 really writes: a wrangler upgrade that changes the scheme fails here.
test('localD1File names the file local D1 keeps a database in', async (t) => {
	const databaseId = '2e4b6ea4-6c67-444a-b37d-73594c5b2c01';
	const stateDir = await createLocalD1(t, { database_id: databaseId });
	const file = localD1File(stateDir, databaseId);
	assert.ok(existsSync(file), `expected ${file}`);
	assert.match(file, /71fe1b0db19f63b5ec62864a7eda39e8216bb0fce3fc6e2f3aa471d7548c85c5\.sqlite$/);
});

test('local D1 keeps a database under its preview_database_id when it has one', async (t) => {
	const database = {
		database_id: '2e4b6ea4-6c67-444a-b37d-73594c5b2c01',
		preview_database_id: '9b0f3c1e-1d2a-4c55-8e7f-0a1b2c3d4e5f'
	};
	const stateDir = await createLocalD1(t, database);
	assert.equal(localDatabaseId(database), database.preview_database_id);
	assert.ok(existsSync(localD1File(stateDir, localDatabaseId(database))));
	assert.ok(!existsSync(localD1File(stateDir, database.database_id)));
});

test('devServerEnv reads LOCAL_STATE_DIR and the network settings as the dev server does', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'atmo-dev-env-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(
		join(directory, '.env'),
		[
			'LOCAL_STATE_DIR=.wrangler/elsewhere',
			'PUBLIC_PLC_URL=http://plc.from-dotenv',
			'PUBLIC_RELAY_URLS=http://relay.from-dotenv',
			'CRON_SECRET=not-for-contrail'
		].join('\n')
	);
	const shell = {
		LOCAL_STATE_DIR: process.env.LOCAL_STATE_DIR,
		PUBLIC_PLC_URL: process.env.PUBLIC_PLC_URL
	};
	t.after(() => {
		for (const [name, value] of Object.entries(shell)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});
	delete process.env.LOCAL_STATE_DIR;
	process.env.PUBLIC_PLC_URL = 'http://plc.from-shell';

	const env = devServerEnv(directory);
	assert.equal(env.LOCAL_STATE_DIR, '.wrangler/elsewhere');
	assert.equal(env.PUBLIC_RELAY_URLS, 'http://relay.from-dotenv');
	// The shell wins over .env, as it does for the dev server.
	assert.equal(env.PUBLIC_PLC_URL, 'http://plc.from-shell');
	// Nothing else from .env: it holds the Worker's secrets too.
	assert.equal(env.CRON_SECRET, undefined);
});

test('contrailCli is contrail’s CLI, which this node runs without a shell', () => {
	const result = spawnSync(process.execPath, [contrailCli(), '--help'], { encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /contrail/);
});

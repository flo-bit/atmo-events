import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const pnpm = process.env.KIT_DEV_TEST_PNPM || process.env.npm_execpath;
assert.ok(pnpm, 'Run with pnpm test:kit-dev (or set KIT_DEV_TEST_PNPM to a pnpm executable).');

function execute(args, cwd, extraEnv = {}) {
	const js = /\.(?:c|m)?js$/.test(pnpm);
	const env = { ...process.env, CI: 'false', ATMO_KIT_PATH: '', ...extraEnv };
	// Exercise fresh-shell behavior, not pnpm's skip-verification lifecycle env.
	delete env.pnpm_config_verify_deps_before_run;
	return spawnSync(js ? process.execPath : pnpm, js ? [pnpm, ...args] : args, {
		cwd,
		encoding: 'utf8',
		timeout: 30_000,
		env
	});
}

function success(args, cwd, env) {
	const result = execute(args, cwd, env);
	assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
}

function failure(args, cwd, pattern, env) {
	const result = execute(args, cwd, env);
	assert.notEqual(result.status, 0);
	assert.match(result.stdout + result.stderr, pattern);
}

function write(path, content) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function manifest(path, value) {
	write(path, JSON.stringify(value, null, 2) + '\n');
}

function kit(directory, source) {
	manifest(join(directory, 'package.json'), {
		name: '@atmo-dev/kit',
		version: '0.0.2',
		type: 'module',
		files: ['dist'],
		exports: { '.': './dist/index.js', './theme.css': './dist/theme.css' }
	});
	write(join(directory, 'dist/index.js'), `export const source = '${source}';\n`);
	write(join(directory, 'dist/index.d.ts'), 'export declare const source: string;\n');
	write(join(directory, 'dist/theme.css'), '/* fixture theme */\n');
}

test(
	'kit modes work across a workspace without editing manifests, config, or the wanted lockfile',
	{ timeout: 120_000 },
	async (t) => {
		const directory = mkdtempSync(join(tmpdir(), 'atmo-kit-dev-'));
		const root = join(directory, '02-app');
		const checkout = join(directory, '00-atmo-kit/kit');
		const packedKit = join(directory, 'packed-kit');
		const consumers = ['apps/web', 'packages/ui'];
		const run = (args, env) => success(args, root, env);
		try {
			const version = success(['--version'], directory).trim();
			manifest(join(root, 'package.json'), {
				name: 'kit-dev-fixture',
				private: true,
				packageManager: `pnpm@${version}`,
				scripts: {
					'kit:local': 'node scripts/kit-dev.mjs local',
					'kit:registry': 'node scripts/kit-dev.mjs registry',
					probe: 'node --version'
				}
			});
			write(
				join(root, 'pnpm-workspace.yaml'),
				"packages:\n  - 'apps/*'\n  - 'packages/*'\nverifyDepsBeforeRun: false\n"
			);
			write(join(root, '.npmrc'), 'offline=true\n');
			for (const file of ['kit-dev.mjs', 'kit-local.pnpmfile.cjs']) {
				mkdirSync(join(root, 'scripts'), { recursive: true });
				copyFileSync(join(scripts, file), join(root, 'scripts', file));
			}

			// A packed fixture stands in for npm, keeping these integration tests offline.
			kit(packedKit, 'registry');
			success(['pack', '--pack-destination', root], packedKit);
			const dependency = 'file:../../atmo-dev-kit-0.0.2.tgz';
			manifest(join(root, 'apps/web/package.json'), {
				name: '@fixture/web',
				private: true,
				dependencies: { '@atmo-dev/kit': dependency, '@fixture/ui': 'workspace:*' }
			});
			manifest(join(root, 'packages/ui/package.json'), {
				name: '@fixture/ui',
				version: '1.0.0',
				devDependencies: { '@atmo-dev/kit': dependency },
				peerDependencies: { '@atmo-dev/kit': '^0.0.2' }
			});
			run(['install', '--ignore-scripts']);
			const files = [
				'package.json',
				'pnpm-lock.yaml',
				'pnpm-workspace.yaml',
				...consumers.map((p) => `${p}/package.json`)
			];
			const before = files.map((file) => readFileSync(join(root, file), 'utf8'));
			const unchanged = () =>
				files.forEach((file, i) =>
					assert.equal(readFileSync(join(root, file), 'utf8'), before[i], file)
				);
			const targets = () =>
				consumers.map((consumer) =>
					realpathSync(join(root, consumer, 'node_modules/@atmo-dev/kit'))
				);
			const registry = () => {
				for (const path of targets()) {
					assert.match(readFileSync(join(path, 'dist/index.js'), 'utf8'), /'registry'/);
				}
				assert.equal(new Set(targets()).size, 1, 'both consumers share one installed kit');
				unchanged();
			};
			const local = (path) => {
				assert.deepEqual(
					targets(),
					consumers.map(() => realpathSync(path))
				);
				unchanged();
			};

			await t.test('registry mode needs no sibling checkout and works in CI', () => {
				run(['kit:registry'], { CI: 'true' });
				registry();
			});
			await t.test('local mode rejects missing, wrong, or unbuilt checkouts', () => {
				failure(['kit:local'], root, /No kit checkout/);
				manifest(join(checkout, 'package.json'), { name: 'wrong-package' });
				failure(['kit:local'], root, /not an @atmo-dev\/kit package/);
				manifest(join(checkout, 'package.json'), { name: '@atmo-dev/kit' });
				failure(['kit:local'], root, /pnpm prepack/);
				unchanged();
			});
			await t.test('local mode links both consumers, is repeatable, and sees dist edits', () => {
				kit(checkout, 'local');
				run(['kit:local']);
				local(checkout);
				run(['kit:local']);
				local(checkout);
				write(join(checkout, 'dist/index.js'), "export const source = 'updated';\n");
				for (const path of targets())
					assert.match(readFileSync(join(path, 'dist/index.js'), 'utf8'), /'updated'/);
			});
			await t.test('normal pnpm scripts preserve local mode without auto-installing', () => {
				run(['run', 'probe']);
				local(checkout);
			});
			await t.test(
				'registry mode restores the packed version even after deleting the checkout',
				() => {
					rmSync(checkout, { recursive: true });
					run(['kit:registry']);
					registry();
				}
			);
			await t.test('ATMO_KIT_PATH supports relative paths with spaces', () => {
				const alternate = join(directory, 'another kit checkout');
				kit(alternate, 'alternate');
				run(['kit:local'], { ATMO_KIT_PATH: '../another kit checkout' });
				local(alternate);
			});
			await t.test('both the command and direct hook invocation refuse local mode in CI', () => {
				const env = { CI: 'true', ATMO_KIT_PATH: '../another kit checkout' };
				failure(['kit:local'], root, /disabled in CI/, env);
				failure(
					['install', '--pnpmfile=./scripts/kit-local.pnpmfile.cjs'],
					root,
					/disabled in CI/,
					env
				);
				unchanged();
			});
			await t.test('a normal frozen install restores registry mode without the helper', () => {
				run(['install', '--frozen-lockfile', '--ignore-scripts']);
				registry();
			});
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	}
);

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import localHook from './kit-local.pnpmfile.cjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

try {
	const mode = process.argv[2];
	if (!['local', 'registry'].includes(mode)) {
		throw new Error('Use pnpm kit:local or pnpm kit:registry.');
	}
	const pnpm = process.env.npm_execpath;
	if (!pnpm) throw new Error("Run this command through pnpm to use the project's pnpm version.");

	const args = ['install'];
	if (mode === 'local') {
		console.log(`Using local kit: ${localHook.localKitPath()}`);
		args.push(`--pnpmfile=${join(root, 'scripts/kit-local.pnpmfile.cjs')}`);
	} else {
		console.log('Restoring the published kit from pnpm-lock.yaml.');
		args.push('--frozen-lockfile');
	}

	const lockfile = join(root, 'pnpm-lock.yaml');
	const before = readFileSync(lockfile);
	const isJavaScript = /\.(?:c|m)?js$/.test(pnpm);
	const result = spawnSync(
		isJavaScript ? process.execPath : pnpm,
		isJavaScript ? [pnpm, ...args] : args,
		{
			cwd: root,
			stdio: 'inherit'
		}
	);
	if (!before.equals(readFileSync(lockfile))) {
		throw new Error(
			'pnpm unexpectedly changed pnpm-lock.yaml. Inspect the diff before committing it.'
		);
	}
	if (result.error) throw result.error;
	if (result.signal) throw new Error(`pnpm was interrupted by ${result.signal}.`);
	process.exitCode = result.status ?? 1;
	if (result.status === 0) console.log('Restart the dev server after switching kit modes.');
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}

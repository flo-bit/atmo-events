// Starts atmo's dev server on the local network for the e2e run, and stops it afterwards.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { ATMO, ATMO_STATE_DIR } from './network';

declare module 'vitest' {
	export interface ProvidedContext {
		cronSecret: string;
	}
}

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const webRoot = join(repoRoot, 'apps/web');

async function answers(url: string) {
	try {
		// Bounded, so a server that takes the connection and never answers can't outlast the deadline.
		return (await fetch(url, { signal: AbortSignal.timeout(5000) })).status < 500;
	} catch {
		return false;
	}
}

export default async function setup(project: TestProject) {
	try {
		return await start(project);
	} catch (error) {
		// Vitest prints an error thrown here as "No test files found" and a crash of its own, so
		// say what went wrong first.
		console.error(`\natmo's e2e setup: ${error instanceof Error ? error.message : error}\n`);
		throw error;
	}
}

async function start(project: TestProject) {
	// The sign-in returns to this exact address, so the port has to be ours.
	if (await answers(ATMO)) {
		throw new Error(`Something already answers at ${ATMO}. Stop it and run the tests again.`);
	}
	// With a .dev.vars, wrangler reads only that file, so the settings below would not reach atmo.
	if (existsSync(join(webRoot, '.dev.vars'))) {
		throw new Error('apps/web/.dev.vars hides these tests’ settings from atmo. Move it aside.');
	}

	// A fresh database each run, so nothing an earlier network left in it carries over: a
	// restarted Jetstream counts from 1 again, and atmo would wait past where it stopped before.
	const state = resolve(webRoot, ATMO_STATE_DIR);
	const inWrangler = relative(join(webRoot, '.wrangler'), state);
	if (!inWrangler || inWrangler.startsWith('..') || isAbsolute(inWrangler)) {
		throw new Error('E2E_ATMO_STATE_DIR must be a folder inside apps/web/.wrangler.');
	}
	rmSync(state, { recursive: true, force: true });

	const cronSecret = randomBytes(16).toString('hex');
	// atmo gets the network's settings from `snowglobe run --app atmo`, and none of the test
	// accounts' passwords. Nor Vitest's own variables (VITEST*, NODE_ENV=test): with them, the
	// dev server stopped during startup.
	const env = Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) => !name.startsWith('E2E_') && !name.startsWith('VITEST') && name !== 'NODE_ENV'
		)
	);
	const server = spawn(
		'pnpm',
		[
			'exec',
			'snowglobe',
			'run',
			'--app',
			'atmo',
			'--',
			'pnpm',
			'--filter',
			'web',
			'dev',
			// Fail rather than move to another port: the sign-in returns to this one.
			'--strictPort'
		],
		{
			cwd: repoRoot,
			env: {
				...env,
				CRON_SECRET: cronSecret,
				COOKIE_SECRET: process.env.COOKIE_SECRET ?? randomBytes(32).toString('hex')
			},
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: true
		}
	);
	let log = '';
	server.stdout?.on('data', (chunk) => (log += chunk));
	server.stderr?.on('data', (chunk) => (log += chunk));
	const stop = () => {
		try {
			if (server.pid) process.kill(-server.pid, 'SIGTERM');
		} catch {
			// already gone
		}
	};

	const deadline = Date.now() + 120_000;
	while (!(await answers(ATMO))) {
		// exitCode stays null when a signal ends the server, so check both.
		const ended = server.exitCode !== null || server.signalCode !== null;
		if (ended || Date.now() > deadline) {
			stop();
			throw new Error(`atmo's dev server did not start at ${ATMO}:\n${log.slice(-3000)}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	project.provide('cronSecret', cronSecret);
	return stop;
}

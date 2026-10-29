import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { buildWorker } from './build-worker.mjs';

async function fixture(t, source) {
	const directory = await mkdtemp(join(tmpdir(), 'atmo-worker-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(join(directory, 'package.json'), '{"type":"module"}');
	const file = join(directory, 'worker.js');
	await writeFile(file, source);
	await buildWorker(file);
	return { file, worker: (await import(pathToFileURL(file).href)).default };
}

// Adapter Cloudflare 8 emits an anonymous export, unlike the old worker_default bundle.
const app = `export default {
	async fetch(request, env, ctx) {
		if (env.fail) throw new Error('cron failed');
		return new Response(JSON.stringify({
			url: request.url,
			method: request.method,
			secret: request.headers.get('X-Cron-Secret'),
			contentType: request.headers.get('Content-Type'),
			binding: env.binding,
			context: ctx.marker
		}));
	}
};`;

test('loads an anonymous adapter export and preserves its fetch handler', async (t) => {
	const { worker } = await fixture(t, app);
	const response = await worker.fetch(
		new Request('https://example.com/event'),
		{ binding: 'db' },
		{ marker: 'ctx' }
	);
	assert.deepEqual(await response.json(), {
		url: 'https://example.com/event',
		method: 'GET',
		secret: null,
		contentType: null,
		binding: 'db',
		context: 'ctx'
	});
	assert.equal(typeof worker.scheduled, 'function');
});

test('forwards scheduled events to authenticated cron using the same bindings and context', async (t) => {
	const { worker } = await fixture(t, app);
	const pending = [];
	worker.scheduled(
		{},
		{ CRON_SECRET: 'test-secret', binding: 'db' },
		{ marker: 'scheduled', waitUntil: (promise) => pending.push(promise) }
	);
	assert.equal(pending.length, 1);
	assert.deepEqual(await (await pending[0]).json(), {
		url: 'http://localhost/api/cron',
		method: 'POST',
		secret: 'test-secret',
		contentType: 'application/json',
		binding: 'db',
		context: 'scheduled'
	});
});

test('scheduled POST passes the installed SvelteKit production CSRF guard', async (t) => {
	const csrf = new URL(
		'./src/runtime/server/csrf.js',
		import.meta.resolve('@sveltejs/kit/package.json')
	);
	const { worker } = await fixture(
		t,
		`
		import { is_csrf_forbidden } from ${JSON.stringify(csrf.href)};
		export default {
			async fetch(request) {
				const forbidden = is_csrf_forbidden({
					request,
					request_origin: request.headers.get('origin'),
					self_origin: new URL(request.url).origin,
					trusted_origins: []
				});
				return new Response(forbidden ? 'CSRF rejected' : 'OK', { status: forbidden ? 403 : 200 });
			}
		}
	`
	);
	const pending = [];
	worker.scheduled({}, { CRON_SECRET: 'test-secret' }, { waitUntil: (p) => pending.push(p) });
	assert.equal((await pending[0]).status, 200);
});

for (const status of [401, 403, 500, 503]) {
	test(`rejects HTTP ${status} from cron in the waitUntil promise`, async (t) => {
		const { worker } = await fixture(
			t,
			`export default {
			async fetch() { return new Response('failed', { status: ${status} }); }
		};`
		);
		const pending = [];
		worker.scheduled({}, { CRON_SECRET: 'test-secret' }, { waitUntil: (p) => pending.push(p) });
		await assert.rejects(pending[0], new RegExp('Scheduled cron failed: HTTP ' + status));
	});
}

test('preserves cron failures in the waitUntil promise', async (t) => {
	const { worker } = await fixture(t, app);
	const pending = [];
	worker.scheduled({}, { fail: true }, { waitUntil: (promise) => pending.push(promise) });
	await assert.rejects(pending[0], /cron failed/);
});

test('can run again without replacing the application with a recursive wrapper', async (t) => {
	const { file } = await fixture(t, app);
	await buildWorker(file);
	assert.equal(await readFile(join(dirname(file), 'sveltekit-worker.js'), 'utf8'), app);
});

test('fails the build if the adapter output is missing', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'atmo-missing-worker-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await assert.rejects(buildWorker(join(directory, 'worker.js')), { code: 'ENOENT' });
});

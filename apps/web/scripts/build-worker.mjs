import { access, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const marker = '// atmo: SvelteKit Worker with scheduled cron forwarding';
const entrypoint = `${marker}
import app from './sveltekit-worker.js';

export default {
	...app,
	scheduled(_event, env, ctx) {
		const request = new Request('http://localhost/api/cron', {
			method: 'POST',
			headers: { 'X-Cron-Secret': env.CRON_SECRET || '' }
		});
		ctx.waitUntil(app.fetch(request, env, ctx));
	}
};
`;

/** Wrap the adapter's public default export, without depending on bundler variable names. */
export async function buildWorker(file = resolve('.svelte-kit/worker.js')) {
	const app = join(dirname(file), 'sveltekit-worker.js');
	const source = await readFile(file, 'utf8');
	if (source.startsWith(marker)) {
		await access(app);
		return;
	}
	await rename(file, app);
	await writeFile(file, entrypoint);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await buildWorker();
	console.log('Worker entrypoint: SvelteKit fetch + scheduled() → /api/cron');
}

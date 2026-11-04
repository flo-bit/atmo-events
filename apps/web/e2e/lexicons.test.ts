// Runs with `pnpm test`, not the e2e run. On the local network, a PDS finds lexicons only in this
// folder (snowglobe.yml publishes it), and a sign-in that asks for a permission set it can't find
// fails at the PDS. So every permission set atmo can ask for needs its lexicon here.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scopes } from '#lib/atproto/settings.js';

const permissionSets = scopes
	.filter((scope) => scope.startsWith('include:'))
	.map((scope) => scope.slice('include:'.length).split('?')[0]);

describe('the e2e network’s lexicons', () => {
	it('cover every permission set atmo can ask for', () => {
		expect(permissionSets.length).toBeGreaterThan(0);
		for (const nsid of permissionSets) {
			const file = new URL(`./lexicons/${nsid.replaceAll('.', '/')}.json`, import.meta.url);
			expect(existsSync(file), `e2e/lexicons has no ${nsid}`).toBe(true);
			expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
				lexicon: 1,
				id: nsid,
				defs: { main: { type: 'permission-set' } }
			});
		}
	});
});

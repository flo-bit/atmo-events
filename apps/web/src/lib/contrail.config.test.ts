import { describe, expect, it } from 'vitest';
import { resolveConfig } from '@atmo-dev/contrail';
import { config } from './contrail.config';

describe('Contrail configuration', () => {
	it('resolves without service auth or external search consumers', () => {
		const resolved = resolveConfig(config);
		expect(resolved.moderation?.reports).toBe(false);
		expect(resolved.serviceAuth).toBeUndefined();
		expect(resolved.changes).toBeUndefined();
		expect('sinks' in resolved).toBe(false);
	});
	it('keeps discoverability in the public listing pipeline', async () => {
		const pipeline = config.collections.event.pipelineQueries!.listDiscoverable;
		const result = await pipeline(undefined as never, new URLSearchParams(), config);
		expect(result.conditions?.join(' ')).toContain('preferences.showInDiscovery');
	});
	it('keeps authored and conference-talk filters server owned', async () => {
		const queries = config.collections.event.pipelineQueries!;
		const authored = await queries.listAuthored(undefined as never, new URLSearchParams(), config);
		expect(authored.conditions?.join(' ')).toContain('IS NULL');
		const talks = await queries.listTalks(
			undefined as never,
			new URLSearchParams('parentUri=at://example/c/key'),
			config
		);
		expect(talks.params).toEqual(['at://example/c/key']);
	});
});

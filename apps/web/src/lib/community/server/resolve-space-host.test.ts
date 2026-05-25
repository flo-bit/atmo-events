import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSpaceHost, clearCache, type ResolvedAuthority } from './resolve-space-host';
import type { AuthorityEntry } from './authority-registry';

const mockResolve = vi.fn();

vi.mock('@atcute/identity-resolver', () => ({
	CompositeDidDocumentResolver: vi.fn().mockImplementation(() => ({
		resolve: mockResolve
	})),
	PlcDidDocumentResolver: vi.fn(),
	WebDidDocumentResolver: vi.fn()
}));

describe('resolveSpaceHost', () => {
	const registry: AuthorityEntry[] = [
		{ endpoint: 'http://localhost:3000', serviceDid: 'did:web:api.dev.openmeet.net', namespace: 'net.openmeet' }
	];

	beforeEach(() => {
		vi.clearAllMocks();
		clearCache();
	});

	it('extracts space_host from DID doc', async () => {
		mockResolve.mockResolvedValue({
			service: [
				{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' },
				{ id: '#space_host', type: 'AtprotoSpaceHost', serviceEndpoint: 'http://localhost:3000' }
			]
		});

		const result = await resolveSpaceHost('did:plc:abc123', registry);
		expect(result).toEqual({
			endpoint: 'http://localhost:3000',
			serviceDid: 'did:web:api.dev.openmeet.net',
			namespace: 'net.openmeet'
		});
	});

	it('falls back to single-entry registry when space_host missing', async () => {
		mockResolve.mockResolvedValue({
			service: [
				{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com' }
			]
		});

		const result = await resolveSpaceHost('did:plc:abc123', registry);
		expect(result).toEqual({
			endpoint: 'http://localhost:3000',
			serviceDid: 'did:web:api.dev.openmeet.net',
			namespace: 'net.openmeet'
		});
	});

	it('throws when space_host missing and multiple registries with no match', async () => {
		mockResolve.mockResolvedValue({ service: [] });

		const multiRegistry: AuthorityEntry[] = [
			{ endpoint: 'http://a:3000', serviceDid: 'did:web:a', namespace: 'ns.a' },
			{ endpoint: 'http://b:3000', serviceDid: 'did:web:b', namespace: 'ns.b' }
		];

		await expect(resolveSpaceHost('did:plc:xyz', multiRegistry)).rejects.toThrow(
			'Cannot resolve authority'
		);
	});

	it('falls back to registry when DID resolution fails', async () => {
		mockResolve.mockRejectedValue(new Error('network error'));

		const result = await resolveSpaceHost('did:plc:abc123', registry);
		expect(result.endpoint).toBe('http://localhost:3000');
	});
});

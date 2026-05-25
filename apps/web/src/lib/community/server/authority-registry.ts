export interface AuthorityEntry {
	endpoint: string;
	serviceDid: string;
	namespace: string;
}

export function parseAuthorityRegistry(envValue: string | undefined): AuthorityEntry[] {
	if (!envValue?.trim()) return [];

	return envValue.split(',').map((entry) => {
		const parts = entry.trim().split('|');
		if (parts.length !== 3) {
			throw new Error(
				`Invalid COMMUNITY_AUTHORITIES entry: "${entry}". Expected format: endpoint|serviceDid|namespace`
			);
		}
		const [endpoint, serviceDid, namespace] = parts;
		if (!endpoint || !serviceDid || !namespace) {
			throw new Error(`Empty field in COMMUNITY_AUTHORITIES entry: "${entry}"`);
		}
		return { endpoint, serviceDid, namespace };
	});
}

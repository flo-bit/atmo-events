import { parsePreferredSocialClient, type PreferredSocialClient } from '@atmo-dev/kit/social';
import { SvelteMap } from 'svelte/reactivity';

export const PREFERRED_CLIENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_PREFIX = 'atmo:preferred-client:v1:';
type Entry = { value: PreferredSocialClient | null; fetchedAt: number };
type Dependencies = {
	fetch?: typeof fetch;
	storage?: () => Pick<Storage, 'getItem' | 'setItem'> | undefined;
	now?: () => number;
};

function browserStorage() {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

/** Only public preferences live here, never OAuth/session data. All mutations
 * happen after hydration; SSR always uses the default social client. */
export class PreferredClientCache {
	private activeDid = $state<string | null>(null);
	private selection = $state<PreferredSocialClient | null>(null);
	private entries = new SvelteMap<string, Entry>();
	private pending = new SvelteMap<string, Promise<void>>();
	private readonly transport: typeof fetch;
	private readonly storage: NonNullable<Dependencies['storage']>;
	private readonly now: () => number;

	constructor(dependencies: Dependencies = {}) {
		this.transport = dependencies.fetch ?? ((...args) => globalThis.fetch(...args));
		this.storage = dependencies.storage ?? browserStorage;
		this.now = dependencies.now ?? Date.now;
	}

	value(did: string | null): PreferredSocialClient | null {
		return did && did === this.activeDid ? this.selection : null;
	}

	private read(did: string): Entry | undefined {
		const memory = this.entries.get(did);
		if (memory) return memory;
		try {
			const raw = this.storage()?.getItem(KEY_PREFIX + did);
			if (!raw) return;
			const entry = JSON.parse(raw);
			if (
				!entry ||
				typeof entry.fetchedAt !== 'number' ||
				!Number.isFinite(entry.fetchedAt) ||
				entry.fetchedAt < 0 ||
				entry.fetchedAt > this.now()
			)
				return;
			const value = entry.value === null ? null : parsePreferredSocialClient(entry.value);
			if (entry.value !== null && !value) return;
			const validated = { value, fetchedAt: entry.fetchedAt };
			this.entries.set(did, validated);
			return validated;
		} catch {
			// Private browsing, blocked storage and corrupt entries are cache misses.
		}
	}

	/** A successful Settings read/save supersedes any older background request. */
	remember(did: string, value: PreferredSocialClient | null): void {
		this.pending.delete(did);
		const entry = { value, fetchedAt: this.now() };
		this.entries.set(did, entry);
		if (this.activeDid === did) this.selection = value;
		try {
			this.storage()?.setItem(KEY_PREFIX + did, JSON.stringify(entry));
		} catch {
			// The in-memory cache still works when persistence is unavailable.
		}
	}

	/** Select the account synchronously, then refresh missing/expired data in
	 * the background. No rejected promise escapes into the page layout. */
	load(did: string | null): Promise<void> {
		if (did !== this.activeDid) {
			// An in-flight response for a previous login must not update a new one.
			this.pending.clear();
			this.activeDid = did;
		}
		const entry = did ? this.read(did) : undefined;
		this.selection = entry?.value ?? null;
		if (!did || (entry && this.now() - entry.fetchedAt < PREFERRED_CLIENT_TTL_MS)) {
			return Promise.resolve();
		}
		const existing = this.pending.get(did);
		if (existing) return existing;

		// Defer transport so Settings can seed a fresh read in the same render.
		const request: Promise<void> = Promise.resolve().then(async () => {
			try {
				if (this.activeDid !== did || this.pending.get(did) !== request) return;
				const response = await this.transport('/api/preferred-client', {
					credentials: 'same-origin',
					cache: 'no-store',
					signal: AbortSignal.timeout(10_000)
				});
				if (!response.ok) return;
				const data: unknown = await response.json();
				if (
					!data ||
					typeof data !== 'object' ||
					!('did' in data) ||
					data.did !== did ||
					!('value' in data)
				)
					return;
				const value = data.value === null ? null : parsePreferredSocialClient(data.value);
				if (data.value !== null && !value) return;
				if (this.activeDid === did && this.pending.get(did) === request) {
					this.remember(did, value);
				}
			} catch {
				// Preserve stale data; a failed read is never cached as "no preference".
			} finally {
				if (this.pending.get(did) === request) this.pending.delete(did);
			}
		});
		this.pending.set(did, request);
		return request;
	}
}

export const preferredClientCache = new PreferredClientCache();

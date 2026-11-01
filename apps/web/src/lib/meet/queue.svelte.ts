import type { ProfileData } from '@atmo-dev/kit';
import { SvelteSet } from 'svelte/reactivity';

export type MeetingTarget = {
	did: string;
	profile?: ProfileData | null;
	fromLink?: boolean;
	incomingUri?: string;
};

/** Resolve scans in capture order, independently of the currently open confirmation. */
export function createMeetingQueue(options: {
	resolve: (actor: string) => Promise<string>;
	viewer: () => string | null;
	onError: (message: string) => void;
	incomingUri?: (did: string) => string;
}) {
	let people = $state<MeetingTarget[]>([]);
	let resolving = $state(0);
	const actors = new SvelteSet<string>();
	const dids = new SvelteSet<string>();
	let generation = 0;
	let sequence = Promise.resolve();

	function include(person: MeetingTarget) {
		if (person.did === options.viewer()) return;
		const incomingUri = person.incomingUri || options.incomingUri?.(person.did);
		if (dids.has(person.did)) {
			if (incomingUri)
				people = people.map((queued) =>
					queued.did === person.did && !queued.incomingUri ? { ...queued, incomingUri } : queued
				);
			return;
		}
		dids.add(person.did);
		people = [...people, incomingUri ? { ...person, incomingUri } : person];
	}
	return {
		get people() {
			return people;
		},
		get resolving() {
			return resolving > 0;
		},
		include,
		add(actor: string) {
			if (actors.has(actor)) return Promise.resolve();
			actors.add(actor);
			const currentGeneration = generation;
			resolving++;
			const job = sequence
				.then(async () => {
					if (generation !== currentGeneration) return;
					const did = await options.resolve(actor);
					if (generation !== currentGeneration) return;
					if (did === options.viewer()) throw new Error('That’s your own account.');
					include({ did });
				})
				.catch((error) => {
					if (generation !== currentGeneration) return;
					actors.delete(actor);
					options.onError(
						error instanceof Error ? error.message : 'Could not open that account. Try again.'
					);
				})
				.finally(() => {
					if (generation === currentGeneration) resolving--;
				});
			sequence = job;
			return job;
		},
		remove(did: string) {
			people = people.filter((person) => person.did !== did);
		},
		clear() {
			generation++;
			people = [];
			resolving = 0;
			actors.clear();
			dids.clear();
			sequence = Promise.resolve();
		}
	};
}

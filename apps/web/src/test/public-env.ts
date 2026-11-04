import { variables } from '../env';

/** $app/env/public for a unit test: every network setting in src/env.ts unset, except `settings`. */
export function publicEnv(settings: Record<string, unknown> = {}) {
	return {
		...Object.fromEntries(Object.keys(variables).map((name) => [name, undefined])),
		...settings
	};
}

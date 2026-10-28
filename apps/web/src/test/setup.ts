import { beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';

// Unit tests run outside workerd. Each route test configures the bindings it
// needs, rather than supplying the removed SvelteKit event.platform property.
beforeEach(() => {
	for (const key of Object.keys(env)) Reflect.deleteProperty(env, key);
	Object.assign(env, { DB: {} });
});

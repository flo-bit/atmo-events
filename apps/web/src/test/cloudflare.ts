import { vi } from 'vitest';

/** Test-only replacement selected by Vite's alias, never bundled in the Worker. */
export const env = {} as Cloudflare.Env;
export const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();

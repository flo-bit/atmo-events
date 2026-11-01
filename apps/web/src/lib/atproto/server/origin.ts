/** OAuth configuration takes an origin, not a base URL with a trailing slash/path. */
export function oauthOrigin(value: string | undefined): string | undefined {
	return value ? new URL(value).origin : undefined;
}

/**
 * Vite sees HTTP behind an HTTPS dev tunnel. Restore the configured scheme only
 * for that exact host, before OAuth checks Origin against event.url.origin.
 * Do not trust arbitrary forwarded headers or rewrite localhost/other hosts.
 * This must only be called in development; production uses the adapter's URL.
 */
export function restoreDevTunnelOrigin(url: URL, configuredUrl: string | undefined): void {
	if (!configuredUrl) return;
	const configured = new URL(configuredUrl);
	if (
		configured.protocol === 'https:' &&
		url.protocol === 'http:' &&
		url.host === configured.host
	) {
		url.protocol = 'https:';
	}
}

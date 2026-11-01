import { describe, expect, it } from 'vitest';
import { oauthOrigin, restoreDevTunnelOrigin } from './origin';

describe('OAuth origins', () => {
	it('strips trailing slashes so metadata, keys and callback URLs are well formed', () => {
		expect(oauthOrigin('https://test.trycloudflare.com/')).toBe('https://test.trycloudflare.com');
		expect(oauthOrigin('https://test.trycloudflare.com')).toBe('https://test.trycloudflare.com');
		expect(oauthOrigin('')).toBeUndefined();
		expect(oauthOrigin(undefined)).toBeUndefined();
	});
	it('restores HTTPS for the explicitly configured tunnel, preserving path and query', () => {
		const url = new URL('http://test.trycloudflare.com/oauth/login?test=1');
		restoreDevTunnelOrigin(url, 'https://test.trycloudflare.com/');
		expect(url.href).toBe('https://test.trycloudflare.com/oauth/login?test=1');
	});
	it.each([
		['http://127.0.0.1:5454/oauth/login', 'https://test.trycloudflare.com/'],
		['http://evil.example/oauth/login', 'https://test.trycloudflare.com/'],
		['http://test.trycloudflare.com.evil.example/oauth/login', 'https://test.trycloudflare.com/'],
		['http://test.trycloudflare.com:8080/oauth/login', 'https://test.trycloudflare.com/'],
		['http://test.trycloudflare.com/oauth/login', 'http://test.trycloudflare.com/'],
		['http://test.trycloudflare.com/oauth/login', undefined],
		['https://test.trycloudflare.com/oauth/login', 'https://test.trycloudflare.com/']
	])('does not rewrite other request origins: %s', (requestUrl, configuredUrl) => {
		const url = new URL(requestUrl!);
		restoreDevTunnelOrigin(url, configuredUrl);
		expect(url.href).toBe(requestUrl);
	});
});

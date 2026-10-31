import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import ErrorPage from './+error.svelte';

const { page } = vi.hoisted(() => ({
	page: { status: 404, error: null as { message: string } | null }
}));
vi.mock('$app/state', () => ({ page }));

beforeEach(() => {
	page.status = 404;
	page.error = null;
});

describe('error page', () => {
	it('shows Astro, a useful 404 message, and a way home', () => {
		page.error = { message: 'Not Found' };
		const html = render(ErrorPage).body;
		expect(html).toContain('Lost in the atmosphere?');
		expect(html).toContain('404');
		expect(html).toContain('This page may have moved');
		expect(html).toContain('src="/Astro.svg"');
		expect(html).toContain('alt=""');
		expect(html).toContain('href="/"');
		expect(html).toContain('Back to home');
		expect(html).not.toContain('Try again');
	});

	it('keeps route-specific error messages and escapes their content', () => {
		page.error = { message: 'Event <deleted> & unavailable' };
		const html = render(ErrorPage).body;
		expect(html).toContain('Event &lt;deleted> &amp; unavailable');
		expect(html).not.toContain('This page may have moved');
	});

	it('offers a retry for server errors with a friendly fallback', () => {
		page.status = 503;
		page.error = { message: 'Internal Error' };
		const html = render(ErrorPage).body;
		expect(html).toContain('503');
		expect(html).toContain('A little turbulence.');
		expect(html).toContain('Something went wrong on our side.');
		expect(html).toContain('Try again');
	});

	it('handles other statuses without calling them missing pages', () => {
		page.status = 403;
		page.error = { message: 'This event is private.' };
		const html = render(ErrorPage).body;
		expect(html).toContain('We couldn’t open this page.');
		expect(html).toContain('This event is private.');
		expect(html).not.toContain('Try again');
	});

	it('has useful fallback copy when no error message is available', () => {
		const html = render(ErrorPage).body;
		expect(html).toContain('This page may have moved');
		expect(html).not.toContain('undefined');
	});
});

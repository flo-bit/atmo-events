import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
const { user } = vi.hoisted(() => ({ user: { isLoggedIn: false, did: null as string | null } }));
vi.mock('#lib/atproto/auth.svelte.js', () => ({ user }));
vi.mock('#lib/components/LoginModal.svelte', () => ({ atProtoLoginModalState: { show: vi.fn() } }));
vi.mock('#lib/moderation/reports.remote', () => ({ submitReport: vi.fn() }));
import AppFooter from './AppFooter.svelte';
import type { ReportSubject } from '#lib/moderation/reporting.js';

const account: ReportSubject = { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:host' };
const event: ReportSubject = {
	$type: 'com.atproto.repo.strongRef',
	uri: 'at://did:plc:host/community.lexicon.calendar.event/event',
	cid: 'bafytest'
};
afterEach(() => {
	user.isLoggedIn = false;
	user.did = null;
});

describe('shared RSVP footer', () => {
	it('shows Terms, Privacy, Imprint, Report, and Source', () => {
		const html = render(AppFooter).body;
		for (const href of [
			'/terms',
			'/privacy',
			'/imprint',
			'mailto:reports@atmo.social',
			'https://github.com/flo-bit/atmo-events'
		]) {
			expect(html).toContain(`href="${href}"`);
		}
		expect(html.match(/<footer\b/g)).toHaveLength(1);
		expect(html.match(/<a\b/g)).toHaveLength(5);
		expect(html).not.toContain('href="/moderation"');
	});
	it.each([
		[account, 'Report account'],
		[event, 'Report event']
	] as const)('keeps contextual reporting available while signed out: %s', (subject, label) => {
		const html = render(AppFooter, { props: { subject } }).body;
		expect(html).toContain(label);
		expect(html).not.toContain('href="mailto:reports@atmo.social"');
	});
	it.each([account, event])('does not offer direct self-reporting', (subject) => {
		user.isLoggedIn = true;
		user.did = 'did:plc:host';
		const html = render(AppFooter, { props: { subject } }).body;
		expect(html).not.toContain('Report account');
		expect(html).not.toContain('Report event');
		expect(html).toContain('mailto:reports@atmo.social');
	});
	it('can disable every link, including contextual reporting', () => {
		const html = render(AppFooter, {
			props: { subject: event, links: { report: false, source: false } }
		}).body;
		expect(html).not.toContain('<footer');
		expect(html).not.toContain('Report event');
	});
});

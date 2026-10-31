import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
vi.mock('#lib/moderation/reports.remote.js', () => ({
	loadReports: vi.fn(),
	resolveReport: vi.fn(),
	hideSubject: vi.fn(),
	undoAction: vi.fn()
}));
vi.mock('@svelte-atproto/oauth/client', () => ({ login: vi.fn() }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
import ModPage from './+page.svelte';
import {
	accountReport,
	eventReport,
	inboxData,
	moderatorDid
} from '#lib/moderation/inbox.fixtures.js';

function markup(
	status: 'open' | 'resolved' = 'open',
	actionDid: string | null = null,
	actionPending = false
) {
	return render(ModPage, {
		props: {
			data: {
				...inboxData({
					status,
					reports: [
						{
							...accountReport,
							status,
							reason: 'Private evidence',
							resolution: status === 'resolved' ? 'Private note' : undefined,
							actionUri: actionDid ? `at://${actionDid}/tools.atmo.moderation.action/one` : null,
							actionPending,
							preview: {
								hidden: false,
								labels: {},
								records: [{ name: '<script>alert(1)</script>' }]
							}
						}
					]
				}),
				did: moderatorDid,
				profile: null,
				isModerator: true,
				pageTitle: 'Reports',
				canPostToBluesky: false
			}
		}
	}).body;
}

describe('moderator inbox rendering', () => {
	it('renders private reports and technical previews during SSR, safely escaped', () => {
		const html = markup();
		expect(html).toContain('Private evidence');
		expect(html).toContain('Technical details');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('Hide account');
		expect(html).toContain('Spam');
		expect(html).not.toContain('reasonSpam');
	});
	it('shows the reporter name, handle and picture, plus a clickable event title', () => {
		const html = render(ModPage, {
			props: {
				data: {
					...inboxData({ reports: [eventReport] }),
					did: moderatorDid,
					profile: null,
					isModerator: true,
					pageTitle: 'Reports',
					canPostToBluesky: false
				}
			}
		}).body;
		expect(html).toContain('Mika Chen');
		expect(html).toContain('@mika.example.com');
		expect(html).toContain('<img');
		expect(html).toContain('After-work atproto meetup');
		expect(html).toContain('href="/p/did%3Aplc%3Acccccccccccccccccccccccc/e/meetup"');
		expect(html).toContain('Rule violation');
		expect(html).toContain('Hide event');
	});
	it('restores open report actions after reload without offering another hide', () => {
		const html = markup('open', moderatorDid);
		expect(html).toContain('Undo hide');
		expect(html).not.toContain('Hide account');
		expect(html).not.toContain('Retry hide');
	});
	it('offers retry for a pending publication only to its moderator', () => {
		expect(markup('open', moderatorDid, true)).toContain('Retry hide');
		expect(markup('open', 'did:plc:dddddddddddddddddddddddd', true)).not.toContain('Retry hide');
	});
	it('shows private resolutions with undo only for the current moderator’s action', () => {
		expect(markup('resolved', moderatorDid)).toContain('Private note');
		expect(markup('resolved', moderatorDid)).toContain('Undo hide');
		expect(markup('resolved', 'did:plc:dddddddddddddddddddddddd')).not.toContain('Undo hide');
	});
});

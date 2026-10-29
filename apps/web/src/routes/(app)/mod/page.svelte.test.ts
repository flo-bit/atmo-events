import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
vi.mock('#lib/moderation/reports.remote.js', () => ({
	loadReports: vi.fn(),
	resolveReport: vi.fn(),
	hideSubject: vi.fn(),
	undoAction: vi.fn()
}));
vi.mock('@svelte-atproto/oauth/client', () => ({ login: vi.fn() }));
import ModPage from './+page.svelte';
const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
function markup(
	status: 'open' | 'resolved' = 'open',
	actionDid: string | null = null,
	actionPending = false
) {
	return render(ModPage, {
		props: {
			data: {
				did,
				profile: null,
				canPostToBluesky: false,
				isModerator: true,
				status,
				canPublishActions: true,
				pageTitle: 'Reports',
				reports: [
					{
						id: 1,
						reportedBy: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb',
						subject: { $type: 'com.atproto.admin.defs#repoRef', did },
						reasonType: 'com.atproto.moderation.defs#reasonSpam',
						reason: 'Private evidence',
						status,
						createdAt: '2026-10-01T00:00:00Z',
						resolution: status === 'resolved' ? 'Private note' : undefined,
						actionUri: actionDid ? `at://${actionDid}/tools.atmo.moderation.action/one` : null,
						actionPending,
						preview: { hidden: false, labels: {}, records: [{ name: '<script>alert(1)</script>' }] }
					}
				]
			}
		}
	}).body;
}
describe('moderator inbox rendering', () => {
	it('renders private reports and indexed previews during SSR, safely escaped', () => {
		const html = markup();
		expect(html).toContain('Private evidence');
		expect(html).toContain('Indexed content and labels');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('Hide subject');
	});
	it('restores open report actions after reload without offering another hide', () => {
		const html = markup('open', did);
		expect(html).toContain('Undo my action');
		expect(html).not.toContain('Hide subject');
		expect(html).not.toContain('Retry hide');
	});
	it('offers retry for a pending publication only to its moderator', () => {
		expect(markup('open', did, true)).toContain('Retry hide');
		expect(markup('open', 'did:plc:cccccccccccccccccccccccc', true)).not.toContain('Retry hide');
	});
	it('shows private resolutions with undo only for the current moderator’s action', () => {
		expect(markup('resolved', did)).toContain('Private note');
		expect(markup('resolved', did)).toContain('Undo my action');
		expect(markup('resolved', 'did:plc:cccccccccccccccccccccccc')).not.toContain('Undo my action');
	});
});

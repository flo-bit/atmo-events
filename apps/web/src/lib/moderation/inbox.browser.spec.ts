import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { error } from '@sveltejs/kit';
import axe from 'axe-core';
import ReportInbox from './ReportInbox.svelte';
import { accountReport, eventReport, inboxData, moderatorDid } from './inbox.fixtures';
import type { InboxActions } from './inbox';
import '../../app.css';

function actions(): InboxActions {
	return {
		authorize: vi.fn(),
		resolve: vi.fn().mockResolvedValue(undefined),
		hide: vi.fn().mockResolvedValue({
			uri: `at://${moderatorDid}/tools.atmo.moderation.action/one`,
			synced: true
		}),
		undo: vi.fn().mockResolvedValue({ synced: true }),
		load: vi.fn().mockResolvedValue({ reports: [] }),
		refresh: vi.fn().mockResolvedValue(undefined)
	};
}
afterEach(async () => {
	vi.restoreAllMocks();
	document.documentElement.classList.remove('dark', 'light');
	await page.viewport(1280, 1000);
});

describe('moderation review', () => {
	it('shows reporter identity, readable reasons, and a clickable event title', async () => {
		await render(ReportInbox, { data: inboxData({ reports: [eventReport] }), actions: actions() });
		await expect
			.element(page.getByRole('link', { name: /Mika Chen/ }))
			.toHaveAttribute('href', eventReport.reporter!.href);
		await expect.element(page.getByRole('img', { name: 'Mika Chen' })).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: /After-work atproto meetup/ }))
			.toHaveAttribute('href', '/p/did%3Aplc%3Acccccccccccccccccccccccc/e/meetup');
		await expect.element(page.getByText('Rule violation', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Technical details', { exact: true })).toBeVisible();
		expect(document.querySelector('pre')?.checkVisibility()).toBe(false);
	});

	it('keeps the inset report in reporter, reason, text, subject, note, actions order', async () => {
		await render(ReportInbox, { data: inboxData({ reports: [eventReport] }), actions: actions() });
		const report = document.querySelector('article')!;
		expect(report.classList.contains('bg-recess/60')).toBe(true);
		const content = report.textContent!;
		const ordered = [
			'Mika Chen',
			'Rule violation',
			eventReport.reason!,
			'Reported event',
			'After-work atproto meetup',
			'Add a private note',
			'Resolve report'
		];
		for (let index = 1; index < ordered.length; index++) {
			expect(content.indexOf(ordered[index])).toBeGreaterThan(content.indexOf(ordered[index - 1]));
		}
	});
	it('omits report text when no details were provided', async () => {
		await render(ReportInbox, {
			data: inboxData({ reports: [{ ...eventReport, reason: undefined }] }),
			actions: actions()
		});
		await expect.element(page.getByText('Rule violation', { exact: true })).toBeVisible();
		await expect
			.element(page.getByText('No details provided.', { exact: true }))
			.not.toBeInTheDocument();
	});
	it('resolves a report with a private note without publishing a hide', async () => {
		const api = actions();
		await render(ReportInbox, { data: inboxData({ reports: [eventReport] }), actions: api });
		await expect
			.element(page.getByRole('link', { name: 'Open reports (12)', exact: true }))
			.toBeVisible();
		await expect.element(page.getByLabelText(/Private note/)).not.toBeVisible();
		await page.getByText('Add a private note', { exact: true }).click();
		await page.getByLabelText(/Private note/).fill('Reviewed with the organizer.');
		await page.getByRole('button', { name: 'Resolve report', exact: true }).click();
		await expect.element(page.getByText('No open reports.', { exact: true })).toBeVisible();
		expect(api.resolve).toHaveBeenCalledExactlyOnceWith({
			id: 1,
			resolution: 'Reviewed with the organizer.'
		});
		expect(api.hide).not.toHaveBeenCalled();
		await expect
			.element(page.getByRole('link', { name: 'Open reports (11)', exact: true }))
			.toBeVisible();
	});

	it('requires confirmation before a public hide and blocks duplicate actions', async () => {
		const api = actions();
		let finish!: (value: { uri: string; synced: boolean }) => void;
		vi.mocked(api.hide).mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		await render(ReportInbox, { data: inboxData({ reports: [eventReport] }), actions: api });
		await page.getByRole('button', { name: 'Hide event…', exact: true }).click();
		await expect.element(page.getByRole('dialog', { name: 'Hide this event?' })).toBeVisible();
		await expect.element(page.getByText(/publishes a public moderation action/)).toBeVisible();
		expect(api.hide).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		expect(api.hide).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Hide event…', exact: true }).click();
		await page.getByRole('button', { name: 'Hide event', exact: true }).click();
		await expect
			.element(page.getByRole('button', { name: 'Hide event', exact: true }))
			.toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
		expect(api.hide).toHaveBeenCalledExactlyOnceWith({ id: 1 });
		finish({ uri: `at://${moderatorDid}/tools.atmo.moderation.action/one`, synced: false });
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect
			.element(page.getByText(/Hide published. Visibility is still syncing/))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Undo hide…', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Hide event…', exact: true }))
			.not.toBeInTheDocument();
		expect(api.refresh).toHaveBeenCalledOnce();
	});

	it('keeps a failed confirmation open and displays safe HTTP errors', async () => {
		const api = actions();
		vi.mocked(api.hide).mockImplementationOnce(async () => {
			error(403, 'Permission expired. Sign in again.');
		});
		await render(ReportInbox, { data: inboxData({ reports: [eventReport] }), actions: api });
		await page.getByRole('button', { name: 'Hide event…', exact: true }).click();
		await page.getByRole('button', { name: 'Hide event', exact: true }).click();
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('Permission expired. Sign in again.');
		await expect.element(page.getByRole('dialog')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Hide event', exact: true }))
			.toBeEnabled();
	});

	it('explains optional authorization without blocking private review', async () => {
		const api = actions();
		await render(ReportInbox, {
			data: inboxData({ canPublishActions: false, reports: [eventReport] }),
			actions: api
		});
		await expect
			.element(page.getByRole('button', { name: 'Resolve report', exact: true }))
			.toBeEnabled();
		await expect
			.element(page.getByRole('button', { name: 'Hide event…', exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Enable hiding', exact: true }).click();
		expect(api.authorize).toHaveBeenCalledOnce();
	});

	it('shows resolved notes and confirms undo of only your own action', async () => {
		const api = actions();
		const uri = `at://${moderatorDid}/tools.atmo.moderation.action/one`;
		await render(ReportInbox, {
			data: inboxData({
				status: 'resolved',
				reports: [
					{
						...eventReport,
						status: 'resolved',
						resolution: 'Checked with organizer.',
						actionUri: uri
					}
				]
			}),
			actions: api
		});
		await expect.element(page.getByText('Checked with organizer.', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Resolve report', exact: true }))
			.not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Undo hide…', exact: true }).click();
		await expect.element(page.getByRole('dialog', { name: 'Undo this hide?' })).toBeVisible();
		expect(api.undo).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Undo hide', exact: true }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(api.undo).toHaveBeenCalledExactlyOnceWith({ uri });
	});

	it('deduplicates paginated reports and keeps their profile metadata', async () => {
		const api = actions();
		vi.mocked(api.load).mockResolvedValue({ reports: [eventReport, accountReport] });
		await render(ReportInbox, {
			data: inboxData({ reports: [eventReport], cursor: 'next' }),
			actions: api
		});
		await page.getByRole('button', { name: 'Load more reports', exact: true }).click();
		await expect.poll(() => document.querySelectorAll('article').length).toBe(2);
		expect(api.load).toHaveBeenCalledExactlyOnceWith({ status: 'open', cursor: 'next' });
		await expect
			.element(page.getByRole('button', { name: 'Load more reports', exact: true }))
			.not.toBeInTheDocument();
	});

	it('ignores a stale pagination response after switching inboxes', async () => {
		const api = actions();
		let finish!: (value: { reports: (typeof eventReport)[] }) => void;
		vi.mocked(api.load).mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		const view = await render(ReportInbox, {
			data: inboxData({ reports: [], cursor: 'next' }),
			actions: api
		});
		await page.getByRole('button', { name: 'Load more reports', exact: true }).click();
		await view.rerender({ data: inboxData({ status: 'resolved', reports: [] }), actions: api });
		finish({ reports: [eventReport] });
		await expect.element(page.getByText('No resolved reports.', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: /After-work atproto meetup/ }))
			.not.toBeInTheDocument();
	});

	it.each(['light', 'dark'])(
		'is accessible in %s mode, including the confirmation dialog',
		async (theme) => {
			document.documentElement.classList.add(theme);
			await render(ReportInbox, {
				data: inboxData({ reports: [eventReport] }),
				actions: actions()
			});
			let audit = await axe.run(document.body, {
				runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
			});
			expect(audit.violations.map(({ id }) => id)).toEqual([]);
			await page.getByRole('button', { name: 'Hide event…', exact: true }).click();
			await expect.element(page.getByRole('dialog')).toBeVisible();
			audit = await axe.run(document.body, {
				runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }
			});
			expect(audit.violations.map(({ id }) => id)).toEqual([]);
		}
	);

	it('fits mobile screens, including long identifiers and technical details', async () => {
		await page.viewport(320, 900);
		await render(ReportInbox, {
			data: inboxData({
				reports: [
					{
						...eventReport,
						reporter: undefined,
						subjectProfile: undefined,
						reason: 'VeryLongEvidence'.repeat(25)
					}
				]
			}),
			actions: actions()
		});
		await page.getByText('Technical details', { exact: true }).click();
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
	});
});

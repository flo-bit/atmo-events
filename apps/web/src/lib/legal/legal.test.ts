import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PolicyPage from '#lib/components/PolicyPage.svelte';
import { legalDocuments } from './documents';
import { legalDraftConfig, legalReviewNeeded } from './config';
import { createRsvpLegalDrafts } from './drafts';
import { getLegalDraftIssues, getLegalDocumentIssues } from '@atmo-dev/kit/legal';

describe('RSVP legal document snapshots', () => {
	it('keeps three documents, with moderation and reporting inside Terms', () => {
		for (const documents of [legalDocuments, createRsvpLegalDrafts(legalDraftConfig)]) {
			expect(Object.keys(documents)).toEqual(['terms', 'privacy', 'imprint']);
			const ids = documents.terms.sections.map((section) => section.id);
			expect(ids).toEqual(expect.arrayContaining(['guidelines', 'reporting', 'actions']));
			expect(ids).not.toContain('conduct');
			expect(ids.filter((id) => id === 'contact')).toHaveLength(1);
		}
	});
	it.each(Object.entries(legalDocuments))(
		'renders %s without status labels while preserving draft indexing rules',
		(_kind, document) => {
			const { body, head } = render(PolicyPage, { props: { document } });
			expect(document.status).toBe('draft');
			expect(document.updated).toBe('2026-10-31');
			expect(body).toContain('2026-10-31');
			expect(body).toContain(document.title);
			expect(body).not.toContain('Draft — not yet published.');
			expect(body).not.toMatch(
				/needs review|require review|require confirmation|awaiting confirmation|must be confirmed/i
			);
			expect(body).not.toMatch(/Cloudflare KV|Cloudflare D1|Cloudflare R2|Contrail/);
			expect(head).toContain('noindex, nofollow');
			expect(new Set(document.sections.map((section) => section.id)).size).toBe(
				document.sections.length
			);
		}
	);
	it('does not pretend the missing postal address or publication review is complete', () => {
		expect(getLegalDraftIssues(legalDraftConfig)).toContain(
			'The operator postal address must be supplied and reviewed.'
		);
		expect(legalReviewNeeded.length).toBeGreaterThan(0);
		expect(getLegalDocumentIssues(legalDocuments.privacy)).toContain('Document is still a draft.');
	});
	it('does not suppress indexing once an app-owned document has been reviewed and published', () => {
		const { head, body } = render(PolicyPage, {
			props: { document: { ...legalDocuments.imprint, status: 'published', updated: '2026-10-30' } }
		});
		expect(head).not.toContain('noindex');
		expect(body).toContain('2026-10-30');
		expect(body).not.toContain('Draft —');
	});
});

import { describe, expect, it } from 'vitest';
import { error } from '@sveltejs/kit';
import { moderationErrorMessage, reportReason, reportSubject } from './inbox';
import { accountReport, eventReport } from './inbox.fixtures';

describe('inbox presentation', () => {
	it('links event and account reports to their canonical app pages', () => {
		expect(reportSubject(eventReport)).toMatchObject({
			kind: 'event',
			title: 'After-work atproto meetup',
			href: '/p/did%3Aplc%3Acccccccccccccccccccccccc/e/meetup'
		});
		expect(reportSubject(accountReport)).toMatchObject({
			kind: 'account',
			title: 'Alex Rivera',
			href: accountReport.subjectProfile!.href
		});
	});
	it('keeps deleted events linkable and does not turn arbitrary URIs into links', () => {
		expect(reportSubject({ ...eventReport, preview: undefined })).toMatchObject({
			title: 'Reported event',
			href: '/p/did%3Aplc%3Acccccccccccccccccccccccc/e/meetup'
		});
		expect(
			reportSubject({
				...eventReport,
				subject: { $type: 'com.atproto.repo.strongRef', uri: 'javascript:alert(1)', cid: 'cid' }
			}).href
		).toBeUndefined();
	});
	it('uses only the matching event record for its title', () => {
		expect(
			reportSubject({
				...eventReport,
				preview: {
					hidden: false,
					labels: {},
					records: [{ uri: 'at://unrelated', value: { name: 'Wrong event' } }]
				}
			}).title
		).toBe('Reported event');
	});
	it('shows human-readable reason labels with a safe fallback', () => {
		expect(reportReason(eventReport.reasonType)).toBe('Rule violation');
		expect(reportReason('unknown#reason')).toBe('Other concern');
	});
	it('preserves safe HTTP errors but never exposes server/storage error details', () => {
		try {
			error(403, 'Moderator access required');
		} catch (cause) {
			expect(moderationErrorMessage(cause)).toBe('Moderator access required');
		}
		expect(moderationErrorMessage(new Error('SECRET database path'))).not.toContain('SECRET');
		try {
			error(500, 'SECRET database path');
		} catch (cause) {
			expect(moderationErrorMessage(cause)).not.toContain('SECRET');
		}
	});
});

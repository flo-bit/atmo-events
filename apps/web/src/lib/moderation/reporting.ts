import { isHttpError } from '@sveltejs/kit';

export const REPORT_EMAIL = 'reports@atmo.social';
export type ReportSubject =
	| { $type: 'com.atproto.admin.defs#repoRef'; did: string }
	| { $type: 'com.atproto.repo.strongRef'; uri: string; cid: string };

export function canReportSubject(
	subject: ReportSubject,
	viewerDid: string | null | undefined
): boolean {
	const owner =
		subject.$type === 'com.atproto.admin.defs#repoRef' ? subject.did : subject.uri.split('/')[2];
	return !viewerDid || viewerDid !== owner;
}

export function reportSubjectUrl(subject: ReportSubject): string {
	if (subject.$type === 'com.atproto.admin.defs#repoRef') {
		return `https://atmo.rsvp/p/${encodeURIComponent(subject.did)}`;
	}
	const match = /^at:\/\/([^/]+)\/community\.lexicon\.calendar\.event\/([^/]+)$/.exec(subject.uri);
	return match
		? `https://atmo.rsvp/p/${encodeURIComponent(match[1])}/e/${encodeURIComponent(match[2])}`
		: subject.uri;
}

export function reportErrorMessage(cause: unknown): string {
	if (isHttpError(cause)) {
		if (cause.status === 401) return 'Your session expired. Sign in again to send your report.';
		if (cause.status === 429) return 'Too many reports. Try again in an hour or report by email.';
		if (cause.status >= 500)
			return 'Reporting is unavailable right now. Try again or report by email.';
		return cause.body.message;
	}
	return cause instanceof Error
		? cause.message
		: 'Report could not be sent. Try again or report by email.';
}

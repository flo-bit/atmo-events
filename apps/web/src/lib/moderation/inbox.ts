import { isHttpError } from '@sveltejs/kit';
import { isDid } from '@atcute/lexicons/syntax';
import type { ModerationReport } from '@atmo-dev/contrail/moderation';

export type InboxProfile = {
	did: string;
	href: string;
	name: string;
	handle?: string;
	avatar?: string;
};
export type InboxReport = ModerationReport & {
	actionPending?: boolean;
	reporter?: InboxProfile;
	subjectProfile?: InboxProfile;
};
export type InboxData = {
	did: string | null;
	status: 'open' | 'resolved';
	canPublishActions: boolean;
	openCount: number;
	reports: InboxReport[];
	cursor?: string;
};
export type InboxActions = {
	authorize: () => unknown;
	resolve: (input: { id: number; resolution?: string }) => Promise<unknown>;
	hide: (input: { id: number }) => Promise<{ uri: string; synced: boolean }>;
	undo: (input: { uri: string }) => Promise<{ synced: boolean }>;
	load: (input: { status: 'open' | 'resolved'; cursor?: string }) => Promise<{
		reports: InboxReport[];
		cursor?: string;
	}>;
	refresh: () => Promise<unknown>;
};

export function fallbackProfile(did: string): InboxProfile {
	return {
		did,
		href: `/p/${encodeURIComponent(did)}`,
		name: did.length > 32 ? `${did.slice(0, 18)}…${did.slice(-6)}` : did
	};
}

export function subjectDid(report: ModerationReport): string | undefined {
	if (report.subject.$type === 'com.atproto.admin.defs#repoRef') return report.subject.did;
	const did = /^at:\/\/([^/]+)\//.exec(report.subject.uri)?.[1];
	return did && isDid(did) ? did : undefined;
}

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function reportSubject(report: InboxReport) {
	const profile = report.subjectProfile ?? fallbackProfile(subjectDid(report) ?? 'Unknown account');
	if (report.subject.$type === 'com.atproto.admin.defs#repoRef') {
		return { kind: 'account' as const, title: profile.name, href: profile.href, profile };
	}
	const uri = report.subject.uri;
	const match = /^at:\/\/([^/]+)\/community\.lexicon\.calendar\.event\/([^/?#]+)$/.exec(uri);
	const record = report.preview?.records.map(object).find((entry) => entry.uri === uri);
	const value = object(record?.value);
	return {
		kind: match ? ('event' as const) : ('record' as const),
		title:
			typeof value.name === 'string' && value.name.trim()
				? value.name
				: match
					? 'Reported event'
					: 'Reported record',
		href:
			match && isDid(match[1])
				? `/p/${encodeURIComponent(match[1])}/e/${encodeURIComponent(match[2])}`
				: undefined,
		startsAt: typeof value.startsAt === 'string' ? value.startsAt : undefined,
		profile
	};
}

const reasons: Record<string, string> = {
	reasonSpam: 'Spam',
	reasonViolation: 'Rule violation',
	reasonMisleading: 'Misleading content',
	reasonSexual: 'Sexual content',
	reasonRude: 'Harassment or abuse',
	reasonOther: 'Other concern',
	reasonAppeal: 'Appeal'
};
export function reportReason(reason: string): string {
	return reasons[reason.split('#').at(-1) ?? ''] ?? 'Other concern';
}

export function moderationErrorMessage(cause: unknown): string {
	if (isHttpError(cause) && cause.status < 500) return cause.body.message;
	return 'Couldn’t update the report. Please try again.';
}

import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { ModerationReportError, type ListModerationReportsInput } from '@atmo-dev/contrail';
import { deleteModerationAction } from '@atmo-dev/contrail/moderation';
import { getAuth } from '#lib/atproto/server/oauth.js';
import { ensureInit } from '#lib/contrail/index.js';
import { getReports, isModerator } from './server';
import { publishReportAction, withActionLinks } from './actions';
import { enrichInboxReports } from './profiles.server';

export function requireReporter(locals: Pick<App.Locals, 'did'>) {
	if (!locals.did) error(401, 'Sign in to report content');
	return locals.did;
}
export function requireModerator(locals: Pick<App.Locals, 'did'>) {
	const did = requireReporter(locals);
	if (!isModerator(did)) error(403, 'Moderator access required');
	return did;
}

/** Framework adapter: preserve domain status; never expose storage failures. */
export async function reportOperation<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (cause) {
		if (cause instanceof ModerationReportError) error(cause.status, cause.message);
		throw cause;
	}
}
export async function submitForSession(locals: Pick<App.Locals, 'did'>, input: unknown) {
	const did = requireReporter(locals);
	return reportOperation(async () => (await getReports()).create(did, input));
}
export async function listForSession(
	locals: Pick<App.Locals, 'did'>,
	input: ListModerationReportsInput = {}
) {
	const did = requireModerator(locals);
	return reportOperation(async () => {
		const page = await (await getReports()).list(did, input);
		const reports = await withActionLinks(env.REPORTS_DB, page.reports);
		const { config } = await ensureInit(env.DB);
		const count = await env.REPORTS_DB.prepare(
			"SELECT COUNT(*) AS count FROM moderation_reports WHERE status = 'open'"
		).first<{ count: number }>();
		return {
			...page,
			openCount: Number(count?.count ?? 0),
			reports: await enrichInboxReports(env.DB, config, reports)
		};
	});
}
export async function resolveForSession(locals: Pick<App.Locals, 'did'>, input: unknown) {
	const did = requireModerator(locals);
	return reportOperation(async () => (await getReports()).resolve(did, input));
}

export async function hideForSession(
	locals: Pick<App.Locals, 'did' | 'client'>,
	input: { id: number }
) {
	const did = requireModerator(locals);
	if (!locals.client) error(401, 'Sign in again');
	if (
		!(await getAuth().api.can({
			type: 'repo',
			collection: 'tools.atmo.moderation.action',
			action: 'create'
		}))
	) {
		error(403, 'Authorize moderation actions first');
	}
	await getReports();
	const uri = await publishReportAction(env.REPORTS_DB, locals.client, did, input.id);
	// A PDS write is already committed. Do not turn an indexing outage into an
	// apparent failed write that encourages duplicate public actions.
	let synced = false;
	try {
		synced = !(await (await ensureInit(env.DB)).notify(uri, env.DB)).errors?.length;
	} catch (cause) {
		console.error('[moderation] action indexing pending', cause);
	}
	return { uri, synced };
}

export async function undoForSession(locals: Pick<App.Locals, 'did' | 'client'>, uri: string) {
	const did = requireModerator(locals);
	if (!locals.client) error(401, 'Sign in again');
	if (
		!(await getAuth().api.can({
			type: 'repo',
			collection: 'tools.atmo.moderation.action',
			action: 'delete'
		}))
	) {
		error(403, 'Authorize moderation actions first');
	}
	await getReports();
	await deleteModerationAction({ client: locals.client, did, uri });
	await env.REPORTS_DB.prepare('DELETE FROM report_actions WHERE uri = ?').bind(uri).run();
	let synced = false;
	try {
		synced = !(await (await ensureInit(env.DB)).notify(uri, env.DB)).errors?.length;
	} catch (cause) {
		console.error('[moderation] undo indexing pending', cause);
	}
	return { synced };
}

import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import * as TID from '@atcute/tid';
import { error } from '@sveltejs/kit';
import { MODERATION_ACTION_NSID, ModerationRequestError } from '@atmo-dev/contrail/moderation';

type ActionLink = { report_id: number; uri: string; record: string; published: number };

/** REPORTS_DB is initialized by getReports before these helpers are called. */
export async function withActionLinks<T extends { id: number; actionUri?: string | null }>(
	db: D1Database,
	reports: T[]
) {
	if (!reports.length) return [] as Array<T & { actionPending: boolean }>;
	const rows = await db
		.prepare(
			`SELECT report_id, uri, published FROM report_actions
		 WHERE report_id IN (${reports.map(() => '?').join(',')})`
		)
		.bind(...reports.map((r) => String(r.id)))
		.all<ActionLink>();
	const links = new Map(rows.results.map((row) => [Number(row.report_id), row]));
	return reports.map((report) => {
		const link = links.get(report.id);
		return {
			...report,
			...(link ? { actionUri: link.uri } : {}),
			actionPending: !!link && !link.published
		};
	});
}

/** Reserve the URI and exact public record BEFORE contacting the PDS. A lost
 * response or reload can retry the same create, never publish a second hide. */
export async function publishReportAction(
	db: D1Database,
	client: Client,
	did: Did,
	id: number
): Promise<string> {
	if (!Number.isSafeInteger(id) || id < 0) error(400, 'Invalid report');
	const report = await db
		.prepare('SELECT subject_uri, subject_did, status FROM moderation_reports WHERE id = ?')
		.bind(String(id))
		.first<{ subject_uri: string; subject_did: string; status: string }>();
	if (!report) error(404, 'Report not found');
	if (report.status !== 'open') error(409, 'Report is already resolved');
	const uri = `at://${did}/${MODERATION_ACTION_NSID}/${TID.now()}`;
	// Never copy report evidence, private notes or arbitrary caller fields.
	const record = {
		$type: MODERATION_ACTION_NSID,
		subject: report.subject_uri || report.subject_did,
		action: '!hide',
		createdAt: new Date().toISOString()
	};
	await db
		.prepare(
			`INSERT OR IGNORE INTO report_actions (report_id, uri, record)
		 SELECT id, ?, ? FROM moderation_reports WHERE id = ? AND status = 'open'`
		)
		.bind(uri, JSON.stringify(record), String(id))
		.run();
	const link = await db
		.prepare('SELECT * FROM report_actions WHERE report_id = ?')
		.bind(String(id))
		.first<ActionLink>();
	if (!link) error(409, 'Report is already resolved');
	if (!link.uri.startsWith(`at://${did}/${MODERATION_ACTION_NSID}/`)) {
		error(409, 'Another moderator has already started an action for this report');
	}
	if (link.published) return link.uri;
	const saved = JSON.parse(link.record) as typeof record;
	const rkey = link.uri.split('/').at(-1)!;
	try {
		const result = await client.post('com.atproto.repo.createRecord', {
			input: { repo: did, collection: MODERATION_ACTION_NSID, rkey, record: saved }
		});
		if (!result.ok) {
			throw new ModerationRequestError(result.status, result.data.error, result.data.message);
		}
	} catch (cause) {
		// PDSes differ in their duplicate-create error codes. Confirm the exact
		// saved record instead: an earlier attempt may have lost its response.
		const existing = await client
			.get('com.atproto.repo.getRecord', {
				params: { repo: did, collection: MODERATION_ACTION_NSID, rkey }
			})
			.catch(() => null);
		const value = existing?.ok ? (existing.data.value as Record<string, unknown> | null) : null;
		if (!value || Object.entries(saved).some(([key, field]) => value[key] !== field)) {
			throw cause;
		}
	}
	await db
		.prepare('UPDATE report_actions SET published = 1 WHERE report_id = ? AND uri = ?')
		.bind(String(id), link.uri)
		.run();
	return link.uri;
}

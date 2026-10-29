import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { createSqliteDatabase } from '@atmo-dev/contrail/sqlite';
import { Contrail } from '@atmo-dev/contrail';
const mocks = vi.hoisted(() => ({ ensureInit: vi.fn(), can: vi.fn(), notify: vi.fn() }));
vi.mock('#lib/contrail/index.js', () => ({ ensureInit: mocks.ensureInit }));
vi.mock('#lib/atproto/server/oauth.js', () => ({ getAuth: () => ({ api: { can: mocks.can } }) }));
import { getReports } from './server';
import {
	submitForSession,
	listForSession,
	resolveForSession,
	hideForSession,
	undoForSession
} from './operations';
import { moderatorDids } from './config';

const moderator = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const reporter = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const report = {
	subject: { $type: 'com.atproto.admin.defs#repoRef', did: reporter },
	reasonType: 'com.atproto.moderation.defs#reasonSpam',
	reason: 'Private evidence'
};

beforeEach(async () => {
	vi.resetAllMocks();
	const db = createSqliteDatabase(':memory:');
	const contrail = new Contrail({
		namespace: 'rsvp.atmo',
		profiles: [],
		collections: {},
		moderation: { moderators: [moderator], reports: false }
	});
	await contrail.init(db);
	await db
		.prepare('INSERT INTO identities (did, pds, resolved_at) VALUES (?, ?, ?)')
		.bind(reporter, 'https://pds.example', Date.now())
		.run();
	Object.assign(env, {
		DB: db,
		REPORTS_DB: createSqliteDatabase(':memory:'),
		MODERATOR_DIDS: moderator
	});
	mocks.notify.mockResolvedValue({ indexed: 1, deleted: 0 });
	mocks.ensureInit.mockResolvedValue({ config: contrail.config, notify: mocks.notify });
	mocks.can.mockResolvedValue(true);
});

describe('session-backed moderation', () => {
	it('requires login without accessing storage for anonymous callers', async () => {
		await expect(submitForSession({ did: null }, report)).rejects.toMatchObject({ status: 401 });
		expect(mocks.ensureInit).not.toHaveBeenCalled();
	});
	it('uses the session reporter, not a DID supplied in input', async () => {
		const result = await submitForSession(
			{ did: reporter },
			{ ...report, reportedBy: moderator, actor: moderator }
		);
		expect(result.reportedBy).toBe(reporter);
		expect((await listForSession({ did: moderator })).reports[0].reason).toBe(report.reason);
		await expect(listForSession({ did: reporter })).rejects.toMatchObject({ status: 403 });
		await expect(resolveForSession({ did: reporter }, { id: result.id })).rejects.toMatchObject({
			status: 403
		});
		await resolveForSession({ did: moderator }, { id: result.id, resolution: 'Private note' });
		expect(
			(await listForSession({ did: moderator }, { status: 'resolved' })).reports[0].resolution
		).toBe('Private note');
	});
	it('fails closed when private storage is missing or aliases the projection', async () => {
		Object.assign(env, { REPORTS_DB: undefined });
		await expect(getReports()).rejects.toThrow('separate');
		Object.assign(env, { REPORTS_DB: env.DB });
		await expect(getReports()).rejects.toThrow('separate');
	});
	it('keeps report quotas and subject validation on the server', async () => {
		await expect(
			submitForSession(
				{ did: reporter },
				{ ...report, subject: { ...report.subject, did: moderator } }
			)
		).rejects.toMatchObject({ status: 400 });
		for (let i = 0; i < 10; i++) await submitForSession({ did: reporter }, report);
		await expect(submitForSession({ did: reporter }, report)).rejects.toMatchObject({
			status: 429
		});
	});
	it('publishes only whitelisted public action fields and immediately indexes them', async () => {
		const { id } = await submitForSession({ did: reporter }, report);
		const post = vi.fn(async (_method, { input }) => ({
			ok: true,
			data: { uri: `at://${moderator}/tools.atmo.moderation.action/${input.rkey}`, cid: 'cid' }
		}));
		const result = await hideForSession({ did: moderator, client: { post } as any }, {
			id,
			reason: 'MUST STAY PRIVATE'
		} as any);
		const value = post.mock.calls[0] as unknown as [
			string,
			{ input: { record: Record<string, unknown> } }
		];
		expect(value[1].input.record).toEqual({
			$type: 'tools.atmo.moderation.action',
			subject: reporter,
			action: '!hide',
			createdAt: expect.any(String)
		});
		expect(result.synced).toBe(true);
		expect(mocks.notify).toHaveBeenCalledWith(result.uri, env.DB);
	});
	it('does not let ordinary reporters publish actions or undo another moderator’s record', async () => {
		const post = vi.fn();
		await expect(
			hideForSession({ did: reporter, client: { post } as any }, { id: 1 })
		).rejects.toMatchObject({ status: 403 });
		await expect(
			undoForSession(
				{ did: moderator, client: { post } as any },
				`at://${reporter}/tools.atmo.moderation.action/one`
			)
		).rejects.toThrow('own repository');
		expect(post).not.toHaveBeenCalled();
	});
	it('retains the action through an inbox reload and resolution without client state', async () => {
		const { id } = await submitForSession({ did: reporter }, report);
		const post = vi.fn(async (_method: string, _options: any) => ({ ok: true, data: {} }));
		const locals = { did: moderator, client: { post } as any } as const;
		const action = await hideForSession(locals, { id });
		expect((await listForSession({ did: moderator })).reports[0]).toMatchObject({
			actionUri: action.uri,
			actionPending: false,
			status: 'open'
		});
		// A repeated request after losing the response must not create another hide.
		expect(await hideForSession(locals, { id })).toEqual(action);
		expect(post).toHaveBeenCalledTimes(1);
		await resolveForSession({ did: moderator }, { id, resolution: 'Reviewed' });
		expect(
			(await listForSession({ did: moderator }, { status: 'resolved' })).reports[0]
		).toMatchObject({ actionUri: action.uri, actionPending: false, status: 'resolved' });
		await undoForSession(locals, action.uri);
		expect(post.mock.calls[1][0]).toBe('com.atproto.repo.deleteRecord');
		expect(
			(await listForSession({ did: moderator }, { status: 'resolved' })).reports[0].actionUri
		).toBeNull();
	});
	it('persists intent before publication and reuses the same record on retry', async () => {
		const { id } = await submitForSession({ did: reporter }, report);
		const post = vi.fn(async (_method: string, _options: any): Promise<any> => {
			const [saved] = (await listForSession({ did: moderator })).reports;
			expect(saved.actionPending).toBe(true);
			expect(saved.actionUri).toContain(`at://${moderator}/tools.atmo.moderation.action/`);
			throw new Error('Response lost');
		});
		const get = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 400, data: { error: 'RecordNotFound' } });
		const locals = { did: moderator, client: { post, get } as any } as const;
		await expect(hideForSession(locals, { id })).rejects.toThrow('Response lost');
		const firstInput = post.mock.calls[0][1].input;
		post.mockResolvedValue({ ok: false, status: 400, data: { error: 'RecordAlreadyExists' } });
		get.mockResolvedValue({ ok: true, data: { value: firstInput.record } });
		await hideForSession(locals, { id });
		expect(post.mock.calls[1][1].input).toEqual(firstInput);
		expect((await listForSession({ did: moderator })).reports[0].actionPending).toBe(false);
	});
	it('keeps publication pending if an existing PDS record does not match', async () => {
		const { id } = await submitForSession({ did: reporter }, report);
		const post = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 400, data: { error: 'InvalidRequest' } });
		const get = vi.fn().mockResolvedValue({ ok: true, data: { value: { subject: moderator } } });
		await expect(
			hideForSession({ did: moderator, client: { post, get } as any }, { id })
		).rejects.toThrow('InvalidRequest');
		expect((await listForSession({ did: moderator })).reports[0].actionPending).toBe(true);
	});
	it('does not let another moderator take over a reserved action', async () => {
		const { id } = await submitForSession({ did: reporter }, report);
		const post = vi.fn().mockResolvedValue({ ok: true, data: {} });
		await hideForSession({ did: moderator, client: { post } as any }, { id });
		const other = 'did:plc:cccccccccccccccccccccccc';
		Object.assign(env, { MODERATOR_DIDS: `${moderator},${other}` });
		await expect(
			hideForSession({ did: other, client: { post } as any }, { id })
		).rejects.toMatchObject({ status: 409 });
		expect(post).toHaveBeenCalledTimes(1);
	});
	it('does not publish when a report is missing, resolved or storage fails', async () => {
		const post = vi.fn();
		const locals = { did: moderator, client: { post } as any } as const;
		await expect(hideForSession(locals, { id: 1 })).rejects.toMatchObject({ status: 404 });
		const { id } = await submitForSession({ did: reporter }, report);
		await resolveForSession({ did: moderator }, { id });
		await expect(hideForSession(locals, { id })).rejects.toMatchObject({ status: 409 });
		const open = await submitForSession({ did: reporter }, report);
		// Simulate failure to persist the intent, not only a missing binding.
		await env.REPORTS_DB.prepare('DROP TABLE report_actions').run();
		await expect(hideForSession(locals, { id: open.id })).rejects.toThrow();
		Object.assign(env, { REPORTS_DB: undefined });
		await expect(hideForSession(locals, { id })).rejects.toThrow('separate');
		expect(post).not.toHaveBeenCalled();
	});
	it('rejects malformed operator configuration instead of granting access', () => {
		expect(moderatorDids(undefined)).toEqual([]);
		expect(moderatorDids(`${moderator}, ${moderator}`)).toEqual([moderator]);
		expect(() => moderatorDids('not-a-did')).toThrow();
	});
});

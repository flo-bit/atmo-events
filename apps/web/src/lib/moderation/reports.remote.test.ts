import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	locals: { did: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb' },
	setHeaders: vi.fn(() => {
		throw new Error('Cannot set headers in a remote function');
	}),
	submit: vi.fn(),
	list: vi.fn(),
	resolve: vi.fn(),
	hide: vi.fn(),
	undo: vi.fn()
}));
vi.mock('$app/server', () => ({
	command: (_schema: unknown, handler: (...args: unknown[]) => unknown) =>
		Object.assign(handler, { __: { type: 'command' } }),
	getRequestEvent: () => ({ locals: mocks.locals, setHeaders: mocks.setHeaders })
}));
vi.mock('./operations', () => ({
	submitForSession: mocks.submit,
	listForSession: mocks.list,
	resolveForSession: mocks.resolve,
	hideForSession: mocks.hide,
	undoForSession: mocks.undo
}));

import {
	submitReport,
	loadReports,
	resolveReport,
	hideSubject,
	undoAction
} from './reports.remote';

beforeEach(() => vi.clearAllMocks());

describe('report remote commands', () => {
	it('submits with session locals without calling the forbidden setHeaders API', async () => {
		const input = {
			subject: { $type: 'com.atproto.admin.defs#repoRef' as const, did: mocks.locals.did },
			reasonType: 'com.atproto.moderation.defs#reasonSpam' as const
		};
		mocks.submit.mockResolvedValue({ id: 1 });
		await expect(submitReport(input)).resolves.toEqual({ id: 1 });
		expect(mocks.submit).toHaveBeenCalledWith(mocks.locals, input);
		expect(mocks.setHeaders).not.toHaveBeenCalled();
	});

	it('also leaves headers alone for inbox commands', async () => {
		await loadReports({ status: 'open' });
		await resolveReport({ id: 1 });
		await hideSubject({ id: 1 });
		await undoAction({ uri: 'at://did:plc:test/tools.atmo.moderation.action/one' });
		expect(mocks.list).toHaveBeenCalledWith(mocks.locals, { status: 'open' });
		expect(mocks.resolve).toHaveBeenCalledWith(mocks.locals, { id: 1 });
		expect(mocks.hide).toHaveBeenCalledWith(mocks.locals, { id: 1 });
		expect(mocks.undo).toHaveBeenCalledWith(
			mocks.locals,
			'at://did:plc:test/tools.atmo.moderation.action/one'
		);
		expect(mocks.setHeaders).not.toHaveBeenCalled();
	});
});

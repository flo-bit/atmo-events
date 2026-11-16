import { describe, expect, it } from 'vitest';
import { askedReturnTo, privateEventAccess } from './permissions-asked';

const ALICE = 'did:plc:alice';
const BOB = 'did:plc:bob';
const at = (path: string) => new URL(path, 'https://atmo.example.com');

describe('coming back from asking for private event permissions', () => {
	it('tells the person who asked that their server said no', () => {
		expect(privateEventAccess(at(askedReturnTo('/create', ALICE)), ALICE)).toBe('refused');
	});

	it('keeps the page’s own query, and holds one mark after asking again', () => {
		const back = at(askedReturnTo(askedReturnTo('/create?audience=private', ALICE), ALICE));
		expect(back.searchParams.get('audience')).toBe('private');
		expect(back.searchParams.getAll('asked')).toEqual([ALICE]);
	});

	it('offers the ask to someone who hasn’t asked, or was sent the address by someone who did', () => {
		expect(privateEventAccess(at('/create'), ALICE)).toBe('ask');
		expect(privateEventAccess(at(askedReturnTo('/create', ALICE)), BOB)).toBe('ask');
	});
});

import { describe, it, expect } from 'vitest';
import { parseAuthorityRegistry, type AuthorityEntry } from './authority-registry';

describe('parseAuthorityRegistry', () => {
  it('parses a single authority entry', () => {
    const input = 'http://localhost:3000|did:web:api.dev.openmeet.net|net.openmeet';
    const result = parseAuthorityRegistry(input);
    expect(result).toEqual([
      {
        endpoint: 'http://localhost:3000',
        serviceDid: 'did:web:api.dev.openmeet.net',
        namespace: 'net.openmeet'
      }
    ]);
  });

  it('parses multiple authority entries', () => {
    const input = 'http://localhost:3000|did:web:api.dev.openmeet.net|net.openmeet,https://atmo.rsvp|did:web:atmo.rsvp|rsvp.atmo';
    const result = parseAuthorityRegistry(input);
    expect(result).toHaveLength(2);
    expect(result[0].endpoint).toBe('http://localhost:3000');
    expect(result[1].endpoint).toBe('https://atmo.rsvp');
  });

  it('returns empty array for undefined', () => {
    expect(parseAuthorityRegistry(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseAuthorityRegistry('')).toEqual([]);
  });

  it('throws on malformed entry', () => {
    expect(() => parseAuthorityRegistry('http://localhost:3000|bad')).toThrow(
      'Invalid COMMUNITY_AUTHORITIES entry'
    );
  });
});

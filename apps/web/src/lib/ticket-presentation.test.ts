import { describe, expect, it } from 'vitest';
import {
	getTicketActionState,
	getTicketSalesEndTimestamp,
	isAtmosphereTicketsEventUrl,
	isAtmosphereTicketsUrlForEvent,
	isTicketCtaEligible,
	resolveTicketPresentation,
	sanitizeWebUrl,
	shouldShowRsvpPanel
} from '@atmo-dev/events-ui/event-view/tickets.js';

describe('ticket URL safety and branding', () => {
	it.each([
		'javascript://events.atmosphere.tickets/%0Aalert(1)',
		'data:text/html,hello',
		'file:///tmp/ticket',
		'ftp://events.atmosphere.tickets/ticket',
		'https://user:password@events.atmosphere.tickets/ticket',
		'not a URL'
	])('rejects unsafe or non-web URL %s', (value) => {
		expect(sanitizeWebUrl(value)).toBeNull();
	});

	it('canonicalizes safe web URLs', () => {
		expect(sanitizeWebUrl('  https://example.com/tickets  ')).toBe('https://example.com/tickets');
		expect(sanitizeWebUrl('http://example.com')).toBe('http://example.com/');
	});

	it.each([
		'https://events.atmosphere.tickets/p/did:plc:abc/e/rkey',
		'https://events.atmosphere.tickets:443/p/did:plc:abc/e/rkey'
	])('accepts only a canonical hosted event route: %s', (value) => {
		expect(isAtmosphereTicketsEventUrl(value)).toBe(true);
	});

	it.each([
		'http://events.atmosphere.tickets/p/did:plc:abc/e/rkey',
		'https://www.events.atmosphere.tickets/p/did:plc:abc/e/rkey',
		'https://events.atmosphere.tickets.example/p/did:plc:abc/e/rkey',
		'https://events.atmosphere.tickets:444/p/did:plc:abc/e/rkey',
		'https://events.atmosphere.tickets/',
		'https://events.atmosphere.tickets/privacy',
		'https://events.atmosphere.tickets/p/not-a-did/e/rkey',
		'https://events.atmosphere.tickets/p/did:web:example.com%25ZZ/e/rkey',
		'https://events.atmosphere.tickets/p/did:plc:abc/e/rkey/extra',
		'https://events.atmosphere.tickets/p/did:plc:abc/e/rkey?return=elsewhere',
		'javascript://events.atmosphere.tickets/alert(1)'
	])('does not brand a lookalike or noncanonical URL: %s', (value) => {
		expect(isAtmosphereTicketsEventUrl(value)).toBe(false);
	});

	it('requires the canonical route to match the exact calendar event', () => {
		const eventUri = 'at://did:plc:abc/community.lexicon.calendar.event/rkey';
		expect(
			isAtmosphereTicketsUrlForEvent(
				'https://events.atmosphere.tickets/p/did:plc:abc/e/rkey',
				eventUri
			)
		).toBe(true);
		expect(
			isAtmosphereTicketsUrlForEvent(
				'https://events.atmosphere.tickets/p/did:plc:abc/e/another-event',
				eventUri
			)
		).toBe(false);
		expect(
			isAtmosphereTicketsUrlForEvent(
				'https://events.atmosphere.tickets/p/did:plc:abc/e/rkey',
				'at://did:plc:abc/other.collection/rkey'
			)
		).toBe(false);
	});
});

describe('ticket presentation arbitration', () => {
	const protocol = 'https://events.atmosphere.tickets/p/did:plc:abc/e/123';
	const eventbrite = 'https://eventbrite.example/tickets/123';

	it('uses a canonical protocol destination for the current event', () => {
		const result = resolveTicketPresentation({
			protocolTicketUrl: protocol,
			eventDid: 'did:plc:abc',
			eventRkey: '123',
			showCta: true
		});

		expect(result).toBe(protocol);
	});

	it.each([
		undefined,
		'data:text/plain,not-a-ticket',
		'http://events.atmosphere.tickets/p/did/e/rkey',
		'https://www.events.atmosphere.tickets/p/did/e/rkey',
		'https://events.atmosphere.tickets.example/p/did/e/rkey',
		eventbrite
	])('does not create the special CTA for a noncanonical protocol value: %s', (value) => {
		const result = resolveTicketPresentation({
			protocolTicketUrl: value,
			eventDid: 'did:plc:abc',
			eventRkey: '123',
			showCta: true
		});

		expect(result).toBeNull();
	});

	it('rejects a canonical Atmosphere Tickets URL for a different event', () => {
		expect(
			resolveTicketPresentation({
				protocolTicketUrl: protocol,
				eventDid: 'did:plc:different',
				eventRkey: '123',
				showCta: true
			})
		).toBeNull();
	});

	it('requires a protocol-discovered URL', () => {
		expect(
			resolveTicketPresentation({
				eventDid: 'did:plc:abc',
				eventRkey: '123',
				showCta: true
			})
		).toBeNull();
	});

	it('renders no CTA once ticket sales are past', () => {
		expect(
			resolveTicketPresentation({
				protocolTicketUrl: protocol,
				eventDid: 'did:plc:abc',
				eventRkey: '123',
				showCta: false
			})
		).toBeNull();
	});
});

describe('ticket CTA timing', () => {
	const now = Date.parse('2026-08-13T12:00:00Z');

	it('returns a known end boundary and no boundary for a no-end event', () => {
		expect(getTicketSalesEndTimestamp('2026-08-13T13:00:00Z', '2026-08-13T14:00:00Z')).toBe(
			Date.parse('2026-08-13T14:00:00Z')
		);
		expect(getTicketSalesEndTimestamp('2026-08-13T13:00:00Z', undefined)).toBeNull();
	});

	it.each([
		{ startsAt: 'not-a-date' },
		{ startsAt: '2026-08-13T13:00:00Z', endsAt: 'not-a-date' },
		{ startsAt: undefined },
		{ startsAt: '' }
	])('fails closed for malformed public record dates: %o', (event) => {
		expect(isTicketCtaEligible({ ...event, now })).toBe(false);
		expect(getTicketActionState({ ...event, now })).toBe('unknown');
	});

	it('hides the CTA at the sales boundary and for cancelled events', () => {
		expect(
			isTicketCtaEligible({
				startsAt: '2026-08-13T11:00:00Z',
				endsAt: '2026-08-13T12:00:00Z',
				now
			})
		).toBe(false);
		expect(
			isTicketCtaEligible({
				startsAt: '2026-08-13T13:00:00Z',
				status: 'community.lexicon.calendar.event#cancelled',
				now
			})
		).toBe(false);
		expect(
			getTicketActionState({
				startsAt: '2026-08-13T13:00:00Z',
				status: 'community.lexicon.calendar.event#cancelled',
				now
			})
		).toBe('closed');
	});

	it('keeps a valid no-end event open after it starts', () => {
		expect(isTicketCtaEligible({ startsAt: '2026-08-13T13:00:00Z', now })).toBe(true);
		expect(isTicketCtaEligible({ startsAt: '2026-08-13T11:00:00Z', now })).toBe(true);
		expect(getTicketActionState({ startsAt: '2026-08-13T11:00:00Z', now })).toBe('open');
	});

	it('shows the CTA while a valid event with an end is still open', () => {
		expect(
			isTicketCtaEligible({
				startsAt: '2026-08-13T11:00:00Z',
				endsAt: '2026-08-13T13:00:00Z',
				now
			})
		).toBe(true);
	});
});

describe('ticket-aware RSVP presentation', () => {
	it('hides only the competing signed-out RSVP prompt for explicit required admission', () => {
		expect(shouldShowRsvpPanel({ isLoggedIn: false, ticketAdmissionRequired: true })).toBe(false);
	});

	it('keeps RSVP independent from ticket discovery when admission is optional', () => {
		expect(shouldShowRsvpPanel({ isLoggedIn: true, ticketAdmissionRequired: true })).toBe(true);
		expect(shouldShowRsvpPanel({ isLoggedIn: true, ticketAdmissionRequired: false })).toBe(true);
		expect(shouldShowRsvpPanel({ isLoggedIn: false, ticketAdmissionRequired: false })).toBe(true);
	});

	it('falls back to RSVP when ticket timing cannot be trusted', () => {
		expect(
			shouldShowRsvpPanel({
				isLoggedIn: false,
				ticketAdmissionRequired: true,
				ticketActionState: 'unknown'
			})
		).toBe(true);
	});
});

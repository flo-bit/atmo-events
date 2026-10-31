import type { LegalDraftConfig, LegalFooterLinks } from '@atmo-dev/kit/legal';

/** Authoring input only. Routes render the checked-in documents.json snapshot,
 * never freshly generated text. No package upgrade silently changes the policy. */
export const legalDraftConfig: LegalDraftConfig = {
	app: {
		name: 'atmo.rsvp',
		url: 'https://atmo.rsvp',
		description: 'an app for discovering, publishing, and responding to events on the AT Protocol'
	},
	operator: {
		name: 'Florian Killius',
		address: [],
		email: 'reports@atmo.social'
	},
	privacy: [
		{
			id: 'authentication',
			title: 'Signing in',
			paragraphs: [
				'We use AT Protocol OAuth and store your account identifier and session tokens to keep you signed in. We do not receive your password during sign-in. You choose whether to allow optional Bluesky posting.'
			]
		},
		{
			id: 'public-records',
			title: 'Public data',
			paragraphs: [
				'We index public events, RSVPs, profiles, follows, and moderation records to display and find events. We also cache previews and share images. Events and RSVPs are public, not private invitations.',
				'Changes and deletions are reflected as the index updates; this may not be immediate. Other services can retain their own copies.'
			]
		},
		{
			id: 'reports',
			title: 'Reports and moderation',
			paragraphs: [
				'Reports include your account identifier or email address, the reported content, and your explanation. Reports and case notes are available to moderators and are not published.',
				'Moderation actions may publicly identify the affected event or account, but do not include private report text or notes.'
			]
		},
		{
			id: 'external-services',
			title: 'Hosting and external services',
			paragraphs: [
				'Cloudflare hosts the app and stores its data. Hosting can process request metadata, such as IP addresses, for delivery and security.',
				'Maps, images, and embedded media can connect to external providers, which may receive your IP address. Address searches go to a geocoding provider; event imports fetch their source page.',
				'Opening an event starter pack can create or update a public Bluesky list through our service bot.'
			]
		},
		{
			id: 'device-storage',
			title: 'Cookies and browser storage',
			paragraphs: [
				'We use cookies to keep you signed in and browser storage to remember your theme and recent accounts.'
			]
		}
	],
	moderation: [
		{
			id: 'guidelines',
			title: 'Community guidelines',
			items: [
				'Do not publish illegal content or violate copyright, privacy, or other rights.',
				'Do not harass, threaten, impersonate deceptively, or promote violence.',
				'Do not use events for scams, spam, phishing, or malicious software.'
			]
		},
		{
			id: 'reporting',
			title: 'How to report',
			paragraphs: [
				'Use the report button on an event or profile, or email us with the content link and your reason. You do not need an account to report by email.',
				'For illegal content, explain why you believe it is illegal. Do not attach or redistribute illegal imagery.'
			],
			links: [{ label: 'reports@atmo.social', href: 'mailto:reports@atmo.social' }]
		},
		{
			id: 'actions',
			title: 'Restrictions in this app',
			paragraphs: [
				'Moderators may hide events or accounts from this app. Restrictions can be public, but report details stay private. This does not delete content from its account provider or other apps.',
				'If you think a restriction is wrong, email us with the content link and your explanation.'
			]
		}
	]
};

/** Every footer item can be omitted or set to false independently. */
export const legalFooterLinks: LegalFooterLinks = {
	terms: '/terms',
	privacy: '/privacy',
	imprint: '/imprint',
	moderation: false,
	report: 'mailto:reports@atmo.social',
	source: { label: 'Source', href: 'https://github.com/flo-bit/atmo-events' }
};

export const legalReviewNeeded = [
	'Confirm operator identity, full postal address, and applicable jurisdiction.',
	'Confirm contact channels, supported languages, and actual moderation/appeal/notice procedures.',
	'Review legal bases, processors, recipients, transfer locations and safeguards.',
	'Confirm retention and deletion for sessions, indexed data, caches/backups, logs, reports and email.',
	'Inventory browser storage and third-party media/map providers; verify any required consent/load choices.',
	'Review terms, audience/age rules, statutory obligations, and any acceptance or change-notice flow.',
	'Obtain review of the resulting documents, set each app-owned revision date, and mark documents published only after approval.'
] as const;

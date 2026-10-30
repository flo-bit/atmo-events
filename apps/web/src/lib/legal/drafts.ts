import { createLegalDrafts, type LegalDraftConfig } from '@atmo-dev/kit/legal';

/** RSVP combines community rules, reporting, and appeals into Terms. */
export function createRsvpLegalDrafts(config: LegalDraftConfig) {
	const { terms, privacy, imprint, moderation } = createLegalDrafts(config);
	return {
		terms: {
			...terms,
			sections: terms.sections.flatMap((section) =>
				section.id === 'conduct'
					? moderation.sections.filter((entry) => entry.id !== 'contact')
					: [section]
			)
		},
		privacy,
		imprint
	};
}

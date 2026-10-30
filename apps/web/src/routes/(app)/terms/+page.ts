import { legalDocuments } from '#lib/legal/documents.js';
export const load = () => ({
	pageTitle: legalDocuments.terms.title,
	pageDescription: 'Terms of service for atmo.rsvp.'
});

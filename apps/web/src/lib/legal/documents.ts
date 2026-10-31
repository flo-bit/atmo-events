import type { LegalDocumentData, LegalDocumentKind } from '@atmo-dev/kit/legal';
import snapshot from './documents.json';

// Generated draft, then reviewed/edited in this repository. Dates and publication
// status belong to the app. Tests validate the saved document structure.
export const legalDocuments = snapshot as Record<
	Exclude<LegalDocumentKind, 'moderation'>,
	LegalDocumentData
>;

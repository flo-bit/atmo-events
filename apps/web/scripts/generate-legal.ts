import { getLegalDraftIssues } from '@atmo-dev/kit/legal';
import { createRsvpLegalDrafts } from '../src/lib/legal/drafts';
import { legalDraftConfig, legalReviewNeeded } from '../src/lib/legal/config';

// Deliberately stdout-only: regenerating must not silently overwrite reviewed text.
for (const issue of [...getLegalDraftIssues(legalDraftConfig), ...legalReviewNeeded]) {
	console.error(`Review: ${issue}`);
}
console.log(JSON.stringify(createRsvpLegalDrafts(legalDraftConfig), null, 2));

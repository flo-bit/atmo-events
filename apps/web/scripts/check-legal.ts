import { getLegalDraftIssues, getLegalDocumentIssues } from '@atmo-dev/kit/legal';
import { legalDraftConfig } from '../src/lib/legal/config';
import { legalDocuments } from '../src/lib/legal/documents';

const issues = [
	...getLegalDraftIssues(legalDraftConfig),
	...Object.entries(legalDocuments).flatMap(([kind, document]) =>
		getLegalDocumentIssues(document).map((issue) => `${kind}: ${issue}`)
	)
];
if (issues.length) {
	console.error(
		'Legal documents are not ready for publication:\n' +
			issues.map((issue) => `- ${issue}`).join('\n')
	);
	process.exitCode = 1;
} else {
	console.log('Publication fields are complete. This check is not legal approval.');
}

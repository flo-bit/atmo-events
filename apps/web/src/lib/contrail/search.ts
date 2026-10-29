/** Treat free text as literal FTS5 terms, not operators, column names or syntax.
 * Keep whitespace-separated terms conjunctive rather than requiring a phrase.
 * Server-generated topic expressions must not pass through this function. */
export function literalSearch(term: string): string {
	return term
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => `"${word.replaceAll('"', '""')}"`)
		.join(' AND ');
}

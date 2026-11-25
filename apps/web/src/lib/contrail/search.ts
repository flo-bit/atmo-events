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

/** Outside callers of the public API send `search` raw, and FTS5 rejects ordinary text such as
 * `example.com` as a syntax error, which reaches them as a 500. Valid expressions are left alone;
 * only a failed one is retried as literal terms. */
export async function withLiteralSearchFallback(
	request: Request,
	handle: (request: Request) => Promise<Response>
): Promise<Response> {
	const response = await handle(request);
	const url = new URL(request.url);
	const term = url.searchParams.get('search');
	if (response.status !== 500 || !term) return response;
	const literal = literalSearch(term);
	if (!literal || literal === term) return response;
	url.searchParams.set('search', literal);
	return handle(new Request(url, request));
}

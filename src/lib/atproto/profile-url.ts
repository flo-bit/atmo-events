export function getProfileUrl(handleOrDid: string): string {
	const lower = handleOrDid.toLowerCase();
	if (lower.endsWith('.blacksky.team') || lower.endsWith('.blacksky.app')) {
		return `https://blacksky.community/profile/${handleOrDid}`;
	}
	return `https://bsky.app/profile/${handleOrDid}`;
}

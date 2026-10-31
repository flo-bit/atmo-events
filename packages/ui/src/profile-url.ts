/** Profile routes shared by the RSVP app and its event components. */
export function getLocalProfileUrl(handleOrDid: string): string {
	return `/p/${encodeURIComponent(handleOrDid)}`;
}

export function getProfileUrl(handleOrDid: string): string {
	const lower = handleOrDid.toLowerCase();
	if (lower.endsWith('.blacksky.team') || lower.endsWith('.blacksky.app')) {
		return `https://blacksky.community/profile/${handleOrDid}`;
	}
	return `https://bsky.app/profile/${handleOrDid}`;
}

// This is cost control, not authentication: user agents can be spoofed and
// unidentified scrapers may still generate, within the atomic global budget.
const BULK_CATEGORIES = new Set([
	'AI Crawler',
	'AI Assistant',
	'Search Engine Crawler',
	'Archiver'
]);

// Social unfurlers need to generate previews. Do not block every *Bot client
// indiscriminately: that would also break links shared to these services.
const SOCIAL_PREVIEW =
	/\b(?:Twitterbot|facebookexternalhit|Facebot|LinkedInBot|Slackbot(?:-LinkExpanding)?|Discordbot|TelegramBot|WhatsApp|SkypeUriPreview|Bluesky|Cardyb|Mastodon|Pleroma|Akkoma|Misskey|GoToSocial|Iframely|Embedly)\b/i;
const BULK_CRAWLER =
	/bot\b|crawl|spider|scrapy|GoogleOther|BingPreview|ChatGPT-User|Claude-User|Perplexity-User|python-requests|python-urllib/i;

/** Apply only on storage misses; crawler cache hits remain usable. */
export function canGenerateForRequest(request: Request): boolean {
	const cf = (request as Request & { cf?: { verifiedBotCategory?: string } }).cf;
	if (cf?.verifiedBotCategory && BULK_CATEGORIES.has(cf.verifiedBotCategory)) return false;
	const userAgent = request.headers.get('user-agent') ?? '';
	return SOCIAL_PREVIEW.test(userAgent) || !BULK_CRAWLER.test(userAgent);
}

import { describe, expect, it } from 'vitest';
import { canGenerateForRequest } from './request-policy';

function request(userAgent: string) {
	return new Request('https://atmo.test/p/alice/e/event/og.png', {
		headers: { 'User-Agent': userAgent }
	});
}

describe('OG generation request policy', () => {
	it.each([
		'Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)',
		'Mozilla/5.0 (compatible; Amazonbot/0.1)',
		'Googlebot-Image/1.0',
		'GoogleOther',
		'bingbot/2.0',
		'GPTBot/1.0',
		'OAI-SearchBot/1.0',
		'ChatGPT-User/1.0',
		'ClaudeBot/1.0',
		'Claude-User/1.0',
		'Perplexity-User/1.0',
		'Bytespider',
		'CCBot/2.0',
		'Scrapy/2.0',
		'python-requests/2.32'
	])('does not let bulk crawler %s generate', (userAgent) => {
		expect(canGenerateForRequest(request(userAgent))).toBe(false);
	});

	it.each([
		'Twitterbot/1.0',
		'facebookexternalhit/1.1',
		'Facebot',
		'LinkedInBot/1.0',
		'Slackbot-LinkExpanding 1.0',
		'Discordbot/2.0',
		'TelegramBot (like TwitterBot)',
		'WhatsApp/2.0',
		'Bluesky Cardyb/1.0',
		'Mastodon/4.7.5 (http.rb/5.3.1; +https://g0v.social/)',
		'Misskey/2026',
		'GoToSocial/0.20',
		'Mozilla/5.0 Chrome/156.0.0.0 Safari/537.36',
		'go-camo',
		''
	])('allows browser/social preview client %s', (userAgent) => {
		expect(canGenerateForRequest(request(userAgent))).toBe(true);
	});

	it.each(['AI Crawler', 'AI Assistant', 'Search Engine Crawler', 'Archiver'])(
		'uses Cloudflare classification %s even with an innocuous user agent',
		(category) => {
			const req = request('Mozilla/5.0');
			Object.defineProperty(req, 'cf', { value: { verifiedBotCategory: category } });
			expect(canGenerateForRequest(req)).toBe(false);
		}
	);

	it('allows the verified page-preview category', () => {
		const req = request('Twitterbot/1.0');
		Object.defineProperty(req, 'cf', { value: { verifiedBotCategory: 'Page Preview' } });
		expect(canGenerateForRequest(req)).toBe(true);
	});
});

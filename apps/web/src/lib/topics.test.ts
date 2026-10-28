import { describe, expect, it } from 'vitest';
import { TOPICS, getTopicBySlug, orQueryFromSlug } from './topics';

describe('topics', () => {
	it('builds a disjunction from the topic’s hashtags', () => {
		for (const topic of TOPICS) {
			expect(orQueryFromSlug(topic.slug)?.split(' OR ')).toEqual(
				topic.hashtags.map((tag) => tag.replace(/^#/, ''))
			);
		}
	});

	it.each([
		['ai', 'technology'],
		['web-development', 'technology'],
		['open-source', 'technology'],
		['crypto', 'technology'],
		['cooking', 'food-drink'],
		['wellness', 'fitness'],
		['photography', 'arts-culture'],
		['film', 'arts-culture']
	])('resolves legacy slug %s to %s, including its event query', (legacy, canonical) => {
		const topic = getTopicBySlug(canonical);
		expect(topic).toBeDefined();
		expect(getTopicBySlug(legacy)).toBe(topic);
		expect(orQueryFromSlug(legacy)).toBe(orQueryFromSlug(canonical));
	});

	it('rejects unknown slugs', () => {
		expect(getTopicBySlug('unknown')).toBeUndefined();
		expect(orQueryFromSlug('unknown')).toBeNull();
	});
});

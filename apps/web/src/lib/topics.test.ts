import { describe, expect, it } from 'vitest';
import { TOPICS, getTopicBySlug, orQueryFromSlug } from './topics';

describe('merged topics', () => {
	it('lists 17 topics without the merged-away categories', () => {
		expect(TOPICS).toHaveLength(17);
		for (const slug of [
			'ai',
			'web-development',
			'open-source',
			'crypto',
			'cooking',
			'wellness',
			'photography',
			'film'
		]) {
			expect(TOPICS.map((topic) => topic.slug)).not.toContain(slug);
		}
	});

	it.each([
		{
			slug: 'technology',
			name: 'Technology',
			hashtags: [
				'#tech',
				'#technology',
				'#ai',
				'#machinelearning',
				'#ml',
				'#artificialintelligence',
				'#llm',
				'#webdev',
				'#webdevelopment',
				'#frontend',
				'#backend',
				'#fullstack',
				'#opensource',
				'#foss',
				'#oss',
				'#freesoftware',
				'#crypto',
				'#web3',
				'#blockchain',
				'#ethereum',
				'#bitcoin',
				'#defi'
			]
		},
		{
			slug: 'food-drink',
			name: 'Food & Cooking',
			hashtags: [
				'#food',
				'#foodie',
				'#drinks',
				'#wine',
				'#beer',
				'#foodanddrink',
				'#dinner',
				'#cooking',
				'#baking',
				'#culinary',
				'#chef',
				'#recipe'
			]
		},
		{
			slug: 'fitness',
			name: 'Fitness & Wellness',
			hashtags: [
				'#fitness',
				'#workout',
				'#gym',
				'#exercise',
				'#running',
				'#crossfit',
				'#wellness',
				'#yoga',
				'#meditation',
				'#mindfulness',
				'#mentalhealth'
			]
		},
		{
			slug: 'arts-culture',
			name: 'Arts & Culture',
			hashtags: [
				'#art',
				'#culture',
				'#arts',
				'#gallery',
				'#exhibition',
				'#theatre',
				'#photography',
				'#photo',
				'#photowalk',
				'#camera',
				'#film',
				'#cinema',
				'#movies',
				'#filmmaking',
				'#documentary',
				'#shorts'
			]
		}
	])('$name retains all original hashtags without duplicates', ({ slug, name, hashtags }) => {
		expect(getTopicBySlug(slug)).toMatchObject({ name, hashtags });
		expect(new Set(hashtags).size).toBe(hashtags.length);
		expect(orQueryFromSlug(slug)).toBe(hashtags.map((tag) => tag.slice(1)).join(' OR '));
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
		expect(getTopicBySlug(legacy)).toBe(getTopicBySlug(canonical));
		expect(orQueryFromSlug(legacy)).toBe(orQueryFromSlug(canonical));
	});

	it('still rejects unknown slugs', () => {
		expect(getTopicBySlug('unknown')).toBeUndefined();
		expect(orQueryFromSlug('unknown')).toBeNull();
	});
});

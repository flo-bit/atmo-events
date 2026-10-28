export type Topic = {
	slug: string;
	name: string;
	byline?: string;
	hashtags: string[];
	image: string;
	icon: string;
	gif?: string;
};

export const TOPICS: Topic[] = [
	{
		slug: 'technology',
		name: 'Technology',
		byline: 'Hardware, software, AI, open source, and decentralized technology.',
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
		],
		image: '/topics/technology.jpg',
		icon: 'tabler:cpu'
	},
	{
		slug: 'design',
		name: 'Design & UX',
		byline: 'Making things beautiful and usable.',
		hashtags: ['#design', '#ux', '#ui', '#uxdesign', '#productdesign', '#graphicdesign'],
		image: '/topics/design.jpg',
		icon: 'tabler:palette'
	},
	{
		slug: 'science',
		name: 'Science',
		byline: 'Curiosity as a lifestyle.',
		hashtags: ['#science', '#stem', '#research', '#physics', '#biology', '#chemistry'],
		image: '/topics/science.jpg',
		icon: 'tabler:flask'
	},
	{
		slug: 'music',
		name: 'Music',
		byline: 'Live shows, listening sessions, and jam nights.',
		hashtags: ['#music', '#livemusic', '#concert', '#gig', '#jazz', '#electronic'],
		image: '/topics/music.jpg',
		icon: 'tabler:music'
	},
	{
		slug: 'arts-culture',
		name: 'Arts & Culture',
		byline: 'Galleries, performances, photowalks, and film screenings.',
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
		],
		image: '/topics/arts-culture.jpg',
		icon: 'tabler:theater'
	},
	{
		slug: 'food-drink',
		name: 'Food & Cooking',
		byline: 'Tastings, dinners, cooking classes, and supper clubs.',
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
		],
		image: '/topics/food-drink.jpg',
		icon: 'tabler:tools-kitchen-2'
	},
	{
		slug: 'fitness',
		name: 'Fitness & Wellness',
		byline: 'Group workouts, yoga, meditation, and wellbeing.',
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
		],
		image: '/topics/fitness.jpg',
		icon: 'tabler:barbell'
	},
	{
		slug: 'outdoors',
		name: 'Outdoors',
		byline: 'Hiking, camping, and connecting with nature.',
		hashtags: ['#outdoors', '#hiking', '#nature', '#camping', '#climbing', '#trail'],
		image: '/topics/outdoors.jpg',
		icon: 'tabler:mountain'
	},
	{
		slug: 'gaming',
		name: 'Gaming',
		byline: 'Tabletop, video games, and esports.',
		hashtags: ['#gaming', '#games', '#videogames', '#tabletop', '#boardgames', '#esports', '#dnd'],
		image: '/topics/gaming.jpg',
		icon: 'tabler:device-gamepad-2'
	},
	{
		slug: 'books',
		name: 'Books & Writing',
		byline: 'Book clubs, author talks, and writing workshops.',
		hashtags: ['#books', '#reading', '#writing', '#bookclub', '#literature', '#poetry'],
		image: '/topics/books.jpg',
		icon: 'tabler:book'
	},
	{
		slug: 'entrepreneurship',
		name: 'Entrepreneurship',
		byline: 'Founders, startups, and building things.',
		hashtags: [
			'#startup',
			'#entrepreneurship',
			'#founder',
			'#business',
			'#venture',
			'#solofounder'
		],
		image: '/topics/entrepreneurship.jpg',
		icon: 'tabler:rocket'
	},
	{
		slug: 'education',
		name: 'Education',
		byline: 'Workshops, lectures, and lifelong learning.',
		hashtags: ['#education', '#learning', '#workshop', '#lecture', '#course', '#teaching'],
		image: '/topics/education.jpg',
		icon: 'tabler:school'
	},
	{
		slug: 'community',
		name: 'Community',
		byline: 'Social meetups and local gatherings.',
		hashtags: ['#community', '#social', '#networking', '#meetup', '#local'],
		image: '/topics/community.jpg',
		icon: 'tabler:users'
	},
	{
		slug: 'sustainability',
		name: 'Sustainability',
		byline: 'Working toward a livable planet.',
		hashtags: ['#sustainability', '#climate', '#environment', '#climatechange', '#green', '#eco'],
		image: '/topics/sustainability.jpg',
		icon: 'tabler:plant'
	},
	{
		slug: 'travel',
		name: 'Travel',
		byline: 'Adventures near and far.',
		hashtags: ['#travel', '#adventure', '#wanderlust', '#backpacking', '#explore'],
		image: '/topics/travel.jpg',
		icon: 'tabler:plane'
	},
	{
		slug: 'sports',
		name: 'Sports',
		byline: 'Watch parties, leagues, and pickup games.',
		hashtags: ['#sports', '#football', '#basketball', '#soccer', '#tennis', '#cycling'],
		image: '/topics/sports.jpg',
		icon: 'tabler:ball-football'
	},
	{
		slug: 'activism',
		name: 'Activism',
		byline: 'Organizing, protesting, and making change.',
		hashtags: ['#activism', '#politics', '#civilrights', '#protest', '#advocacy', '#organizing'],
		image: '/topics/activism.jpg',
		icon: 'tabler:speakerphone'
	}
];

// Keep old links and slug-based event queries working after topic merges.
const TOPIC_ALIASES: Record<string, string> = {
	ai: 'technology',
	'web-development': 'technology',
	'open-source': 'technology',
	crypto: 'technology',
	cooking: 'food-drink',
	wellness: 'fitness',
	photography: 'arts-culture',
	film: 'arts-culture'
};

export function getTopicBySlug(slug: string): Topic | undefined {
	const canonicalSlug = Object.hasOwn(TOPIC_ALIASES, slug) ? TOPIC_ALIASES[slug] : slug;
	return TOPICS.find((t) => t.slug === canonicalSlug);
}

/**
 * The FTS5 disjunction query for a topic slug: match events whose
 * name/description mention ANY of the topic's hashtag terms. D1's SQLite FTS5
 * MATCH treats an uppercase `OR` as a real disjunction operator, so this is a
 * true "any term" query. Returns null for an unknown slug so callers (the topic
 * page load AND the load-more registry) can end pagination cleanly rather than
 * run an empty/garbage search — the two MUST derive the query identically or
 * page 1 and load-more drift apart.
 */
export function orQueryFromSlug(slug: string): string | null {
	const topic = getTopicBySlug(slug);
	if (!topic) return null;
	return topic.hashtags.map((h) => h.replace(/^#/, '')).join(' OR ');
}

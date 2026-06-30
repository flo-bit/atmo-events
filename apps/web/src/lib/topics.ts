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
		byline: 'Hardware, software, and everything in between.',
		hashtags: ['#tech', '#technology'],
		image: '/topics/technology.jpg',
		icon: 'tabler:device-laptop'
	},
	{
		slug: 'ai',
		name: 'AI & Machine Learning',
		byline: 'The minds we are building.',
		hashtags: ['#ai', '#machinelearning', '#ml', '#artificialintelligence', '#llm'],
		image: '/topics/ai.png',
		icon: 'tabler:brain'
	},
	{
		slug: 'web-development',
		name: 'Web Development',
		byline: 'Building the open web, one commit at a time.',
		hashtags: ['#webdev', '#webdevelopment', '#frontend', '#backend', '#fullstack'],
		image: '/topics/web-development.png',
		icon: 'tabler:code'
	},
	{
		slug: 'open-source',
		name: 'Open Source',
		byline: 'Code that belongs to everyone.',
		hashtags: ['#opensource', '#foss', '#oss', '#freesoftware'],
		image: '/topics/open-source.jpg',
		icon: 'tabler:brand-open-source'
	},
	{
		slug: 'crypto',
		name: 'Crypto & Web3',
		byline: 'Decentralized money, protocols, and communities.',
		hashtags: ['#crypto', '#web3', '#blockchain', '#ethereum', '#bitcoin', '#defi'],
		image: '/topics/crypto.jpg',
		icon: 'tabler:currency-bitcoin'
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
		byline: 'Galleries, performances, and creative gatherings.',
		hashtags: ['#art', '#culture', '#arts', '#gallery', '#exhibition', '#theatre'],
		image: '/topics/arts-culture.jpg',
		icon: 'tabler:theater'
	},
	{
		slug: 'photography',
		name: 'Photography',
		byline: 'Workshops, photowalks, and critique nights.',
		hashtags: ['#photography', '#photo', '#photowalk', '#camera'],
		image: '/topics/photography.jpg',
		icon: 'tabler:camera'
	},
	{
		slug: 'food-drink',
		name: 'Food & Drink',
		byline: 'Tastings, dinners, and food markets.',
		hashtags: ['#food', '#foodie', '#drinks', '#wine', '#beer', '#foodanddrink', '#dinner'],
		image: '/topics/food-drink.jpg',
		icon: 'tabler:tools-kitchen-2'
	},
	{
		slug: 'fitness',
		name: 'Fitness',
		byline: 'Group workouts, runs, and sports meetups.',
		hashtags: ['#fitness', '#workout', '#gym', '#exercise', '#running', '#crossfit'],
		image: '/topics/fitness.jpg',
		icon: 'tabler:barbell'
	},
	{
		slug: 'wellness',
		name: 'Wellness',
		byline: 'Yoga, meditation, and mindful living.',
		hashtags: ['#wellness', '#yoga', '#meditation', '#mindfulness', '#mentalhealth'],
		image: '/topics/wellness.jpg',
		icon: 'tabler:leaf'
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
		hashtags: ['#startup', '#entrepreneurship', '#founder', '#business', '#venture', '#solofounder'],
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
		name: 'Climate & Sustainability',
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
		slug: 'cooking',
		name: 'Cooking',
		byline: 'Cooking classes, supper clubs, and pop-ups.',
		hashtags: ['#cooking', '#baking', '#culinary', '#chef', '#recipe', '#foodie'],
		image: '/topics/cooking.jpg',
		icon: 'tabler:chef-hat'
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
		slug: 'film',
		name: 'Film & Cinema',
		byline: 'Screenings, festivals, and film discussions.',
		hashtags: ['#film', '#cinema', '#movies', '#filmmaking', '#documentary', '#shorts'],
		image: '/topics/film.jpg',
		icon: 'tabler:movie'
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

export function getTopicBySlug(slug: string): Topic | undefined {
	return TOPICS.find((t) => t.slug === slug);
}

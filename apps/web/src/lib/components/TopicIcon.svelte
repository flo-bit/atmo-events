<script lang="ts">
	import { Icon, type IconNode } from '@atmo-dev/kit';
	import {
		Cpu,
		Palette,
		FlaskConical,
		Music,
		Theater,
		Utensils,
		Dumbbell,
		Mountain,
		Gamepad2,
		BookOpen,
		Rocket,
		GraduationCap,
		Users,
		Sprout,
		Plane,
		Trophy,
		Megaphone,
		Hash
	} from '@sketchyicons/svelte';

	let { slug, class: className = 'size-6' }: { slug: string; class?: string } = $props();

	const icons: Record<string, IconNode> = {
		technology: Cpu,
		design: Palette,
		science: FlaskConical,
		music: Music,
		'arts-culture': Theater,
		'food-drink': Utensils,
		fitness: Dumbbell,
		outdoors: Mountain,
		gaming: Gamepad2,
		books: BookOpen,
		entrepreneurship: Rocket,
		education: GraduationCap,
		community: Users,
		sustainability: Sprout,
		travel: Plane,
		sports: Trophy,
		activism: Megaphone
	};
</script>

<span aria-hidden="true" class="inline-flex shrink-0">
	<Icon img={icons[slug] ?? Hash} class={className} />
</span>

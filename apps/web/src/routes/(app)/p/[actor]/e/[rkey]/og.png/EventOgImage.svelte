<script lang="ts">
	import { Icon } from '@atmo-dev/kit';
	import { CalendarDays } from '@sketchyicons/svelte';

	let {
		name,
		dateStr,
		cardImage,
		backgroundImage,
		blurBackground
	}: {
		name: string;
		dateStr: string;
		/** `src` keys; the renderer supplies the bytes. */
		cardImage: string;
		backgroundImage: string;
		/** Photos are blurred here; the generated avatar is blurred already. */
		blurBackground: boolean;
	} = $props();
</script>

<div class="relative flex h-full w-full bg-black p-0">
	<img
		src={backgroundImage}
		alt=""
		class="absolute inset-0 h-full w-full bg-black"
		style="object-fit: cover;{blurBackground ? ' filter: blur(64px);' : ''}"
		width="400"
		height="210"
	/>

	<div
		class="absolute inset-0"
		style="background: linear-gradient(190deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 50%, rgba(0,0,0,0.3) 100%);"
	>
		.
	</div>
	<!-- `relative`: per CSS, absolute layers paint above non-positioned content. -->
	<div class="relative flex min-w-0 flex-1 flex-col justify-center p-12">
		<h1
			class="text-5xl leading-tight font-bold text-neutral-50"
			style="overflow: hidden; word-break: break-word; max-height: 3.6em;"
		>
			{name}
		</h1>

		<div class="mt-8 flex items-center">
			<Icon img={CalendarDays} size={28} stroke="#a3a3a3" />
			<span class="ml-3 text-2xl text-neutral-300">{dateStr}</span>
		</div>
	</div>

	<div class="relative flex h-full shrink-0 items-center px-8">
		<div class="flex shrink-0 overflow-hidden rounded-3xl">
			<!-- No alt: user text must never be in an attribute. Takumi's HTML parser
			     ends a tag at the first `>`, even inside quotes, and Svelte doesn't
			     escape `>` in attribute values. -->
			<img
				src={cardImage}
				alt=""
				width="420"
				height="420"
				style="width: 420px; height: 420px; object-fit: cover;"
			/>
		</div>
	</div>
</div>

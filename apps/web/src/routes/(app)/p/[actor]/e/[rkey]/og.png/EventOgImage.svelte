<script lang="ts">
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
			<svg
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path
					d="M8 2v3M16 2v3M3.5 9.09h17M21 8.5v8c0 3-1.5 5-5 5H8c-3.5 0-5-2-5-5v-8c0-3 1.5-5 5-5h8c3.5 0 5 2 5 5Z"
					stroke="#a3a3a3"
					stroke-width="1.5"
					stroke-miterlimit="10"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
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

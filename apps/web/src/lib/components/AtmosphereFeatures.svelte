<script lang="ts">
	import { Icon } from '@atmo-dev/kit';
	import { Users, UserPlus, Camera, MessageCircle, Video, Handshake } from '@sketchyicons/svelte';
</script>

<section class="mt-16" aria-labelledby="atmosphere-heading">
	<h2 id="atmosphere-heading" class="text-base-900 dark:text-base-50 mb-8 text-xl font-bold">
		Connected to the Atmosphere
	</h2>

	<dl class="grid gap-x-8 gap-y-6 sm:grid-cols-2">
		<div>
			<dt class="text-base-900 dark:text-base-50 flex items-center gap-2 text-sm font-semibold">
				<span aria-hidden="true" class="text-base-600 dark:text-base-400 inline-flex shrink-0">
					<Icon img={Users} size={20} />
				</span>
				Find your people
			</dt>
			<dd class="text-base-600 dark:text-base-400 mt-1 text-sm leading-relaxed">
				See which events your Bluesky follows are hosting or going to.
			</dd>
		</div>
		<div>
			<dt class="text-base-900 dark:text-base-50 flex items-center gap-2 text-sm font-semibold">
				<span aria-hidden="true" class="text-base-600 dark:text-base-400 inline-flex shrink-0">
					<Icon img={UserPlus} size={20} />
				</span>
				Keep in touch
			</dt>
			<dd class="text-base-600 dark:text-base-400 mt-1 text-sm leading-relaxed">
				Create a Bluesky starter pack from event attendees. It updates automatically as people RSVP.
			</dd>
		</div>
		<div>
			<dt class="text-base-900 dark:text-base-50 flex items-center gap-2 text-sm font-semibold">
				<span aria-hidden="true" class="text-base-600 dark:text-base-400 inline-flex shrink-0">
					<Icon img={Camera} size={20} />
				</span>
				Share the photos
			</dt>
			<dd class="text-base-600 dark:text-base-400 mt-1 text-sm leading-relaxed">
				Show a grain.social photo album right on your event page.
			</dd>
		</div>
		<div>
			<dt class="text-base-900 dark:text-base-50 flex items-center gap-2 text-sm font-semibold">
				<span aria-hidden="true" class="text-base-600 dark:text-base-400 inline-flex shrink-0">
					<Icon img={MessageCircle} size={20} />
				</span>
				Bring the conversation
			</dt>
			<dd class="text-base-600 dark:text-base-400 mt-1 text-sm leading-relaxed">
				Show replies to your event’s Bluesky post as comments on the event page.
			</dd>
		</div>
		<div>
			<dt class="text-base-900 dark:text-base-50 flex items-center gap-2 text-sm font-semibold">
				<span aria-hidden="true" class="text-base-600 dark:text-base-400 inline-flex shrink-0">
					<Icon img={Video} size={20} />
				</span>
				Go live
			</dt>
			<dd class="text-base-600 dark:text-base-400 mt-1 text-sm leading-relaxed">
				Show a live stream.place stream on your event page while the event is happening.
			</dd>
		</div>
		<div>
			<dt class="text-base-900 dark:text-base-50 flex items-center gap-2 text-sm font-semibold">
				<span aria-hidden="true" class="text-base-600 dark:text-base-400 inline-flex shrink-0">
					<Icon img={Handshake} size={20} />
				</span>
				Remember who you met
			</dt>
			<dd class="text-base-600 dark:text-base-400 mt-1 text-sm leading-relaxed">
				Exchange QR codes with
				<a href="/tools/meet" class="text-accent-600 dark:text-accent-400 hover:underline">Meet</a>
				and save public connections compatible with You &amp; Me.
			</dd>
		</div>
	</dl>
</section>

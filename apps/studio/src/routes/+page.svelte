<script lang="ts">
	const demos = [
		{
			href: '/import-event',
			title: 'Import event from anywhere',
			blurb: 'Announce the cross-platform import flow.'
		}
	];
</script>

<svelte:head>
	<title>atmo · studio</title>
</svelte:head>

<main>
	<header>
		<h1>atmo <span class="dot">·</span> studio</h1>
		<p>Local-only motion stage for recording announcement videos.</p>
	</header>

	<ul>
		{#each demos as demo (demo.href)}
			<li>
				<a href={demo.href}>
					<strong>{demo.title}</strong>
					<span>{demo.blurb}</span>
				</a>
			</li>
		{/each}
	</ul>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 80px 24px;
	}
	header {
		margin-bottom: 40px;
	}
	h1 {
		font-size: 32px;
		font-weight: 700;
		letter-spacing: -0.03em;
		margin: 0 0 8px;
	}
	.dot {
		color: #a78bfa;
	}
	header p {
		color: #888;
		font-size: 14px;
		margin: 0;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	a {
		display: block;
		padding: 16px 18px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px;
		text-decoration: none;
		color: inherit;
		transition: background 200ms;
	}
	a:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	a strong {
		display: block;
		font-size: 15px;
		font-weight: 600;
		margin-bottom: 4px;
	}
	a span {
		display: block;
		font-size: 13px;
		color: #888;
	}
</style>

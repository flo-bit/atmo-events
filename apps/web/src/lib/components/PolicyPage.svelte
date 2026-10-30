<script lang="ts">
	import { LegalDocument, type LegalDocumentData } from '@atmo-dev/kit';
	let { document }: { document: LegalDocumentData } = $props();
</script>

<svelte:head>
	{#if document.status !== 'published'}<meta name="robots" content="noindex, nofollow" />{/if}
</svelte:head>
<LegalDocument {document} />

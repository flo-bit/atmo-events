<script lang="ts">
	import PolicyPage from '#lib/components/PolicyPage.svelte';
	import { legalDocuments } from '#lib/legal/documents.js';
</script>

<PolicyPage document={legalDocuments.imprint} />

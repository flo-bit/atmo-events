<script lang="ts">
	// @ts-nocheck
	import DatePickerField from './DatePicker.svelte';
	import TimePicker from './TimePicker.svelte';
	import { untrack } from 'svelte';
	import { BROWSER as browser } from 'esm-env';

	let {
		value = $bindable(''),
		required = false,
		label = '',
		minValue = '',
		referenceTime = ''
	}: {
		value: string;
		required?: boolean;
		label?: string;
		minValue?: string;
		referenceTime?: string;
	} = $props();

	let datePart = $state('');
	let timePart = $state('00:00');
	let timeEl: HTMLDivElement | undefined = $state(undefined);

	const locale = browser ? navigator.language || 'en' : 'en';
	let minDatePart = $derived(minValue ? minValue.split('T')[0] || '' : '');
	let refTimePart = $derived.by(() => {
		if (!referenceTime) return '';
		const [refDate, refTime] = referenceTime.split('T');
		if (refDate && refDate === datePart && refTime) return refTime;
		return '';
	});

	// Default to current date/time rounded up to the next hour when no initial value
	if (browser && !value) {
		const now = new Date();
		const rounded = new Date(now);
		rounded.setMinutes(0, 0, 0);
		rounded.setHours(rounded.getHours() + 1);

		const yyyy = rounded.getFullYear();
		const mm = String(rounded.getMonth() + 1).padStart(2, '0');
		const dd = String(rounded.getDate()).padStart(2, '0');
		const hh = String(rounded.getHours()).padStart(2, '0');
		const min = String(rounded.getMinutes()).padStart(2, '0');

		const defaultDate = `${yyyy}-${mm}-${dd}`;
		const defaultTime = `${hh}:${min}`;
		datePart = defaultDate;
		timePart = defaultTime;
		value = `${defaultDate}T${defaultTime}`;
	}

	// Sync external value -> date/time parts
	$effect(() => {
		const v = value;
		untrack(() => {
			if (v) {
				const [d, t] = v.split('T');
				if (d && d !== datePart) datePart = d;
				if (t && t !== timePart) timePart = t;
			}
		});
	});

	// Sync date/time parts -> external value
	$effect(() => {
		const d = datePart;
		const t = timePart;
		untrack(() => {
			if (d) {
				const newVal = `${d}T${t || '00:00'}`;
				if (newVal !== value) value = newVal;
			}
		});
	});

	function focusTime() {
		// Small delay to let the popover finish closing
		setTimeout(() => {
			if (timeEl) {
				const segment = timeEl.querySelector('[data-segment]');
				if (segment instanceof HTMLElement) {
					segment.focus();
				}
			}
		}, 50);
	}
</script>

<div class="flex min-w-0 flex-1 items-center gap-2">
	<DatePickerField
		bind:value={datePart}
		label={label ? `${label} date` : 'Date'}
		{required}
		minValue={minDatePart}
		{locale}
		onSelect={focusTime}
	/>
	<div bind:this={timeEl} class="shrink-0">
		<TimePicker
			bind:value={timePart}
			label={label ? `${label} time` : 'Time'}
			{required}
			{locale}
			referenceTime={refTimePart}
		/>
	</div>
</div>

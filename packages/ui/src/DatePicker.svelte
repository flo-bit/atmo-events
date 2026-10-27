<script lang="ts">
	// @ts-nocheck
	import { DatePicker } from 'bits-ui';
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import { untrack } from 'svelte';
	import { Icon } from '@atmo-dev/kit';
	import { ChevronLeft, ChevronRight } from '@sketchyicons/svelte';

	let {
		value = $bindable(''),
		required = false,
		label = 'Date',
		minValue = '',
		locale = 'en',
		onSelect
	}: {
		value: string;
		required?: boolean;
		label?: string;
		minValue?: string;
		locale?: string;
		onSelect?: () => void;
	} = $props();

	let isOpen = $state(false);

	const now = new Date();
	const currentYear = now.getFullYear();
	const yearRange = Array.from({ length: 7 }, (_, i) => currentYear - 1 + i);
	const today = new Date();
	const todayDay = today.getDate();
	const todayMonth = today.getMonth() + 1;
	const todayYear = today.getFullYear();

	let internalValue: CalendarDate | undefined = $state(undefined);

	function parseDateStr(str: string): CalendarDate | undefined {
		if (!str) return undefined;
		const [yearStr, monthStr, dayStr] = str.split('-');
		const year = parseInt(yearStr, 10);
		const month = parseInt(monthStr, 10);
		const day = parseInt(dayStr, 10);
		if (isNaN(year) || isNaN(month) || isNaN(day)) return undefined;
		return new CalendarDate(year, month, day);
	}

	function formatDateStr(dt: CalendarDate): string {
		const y = String(dt.year).padStart(4, '0');
		const m = String(dt.month).padStart(2, '0');
		const d = String(dt.day).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	let internalMinValue: CalendarDate | undefined = $derived.by(() => {
		return parseDateStr(minValue);
	});

	$effect(() => {
		const parsed = parseDateStr(value);
		untrack(() => {
			if (parsed) {
				if (
					!internalValue ||
					parsed.year !== internalValue.year ||
					parsed.month !== internalValue.month ||
					parsed.day !== internalValue.day
				) {
					internalValue = parsed;
					previousValue = parsed;
				}
			} else {
				internalValue = undefined;
			}
		});
	});

	let previousValue: CalendarDate | undefined = $state(undefined);

	function handleValueChange(newVal: DateValue | undefined) {
		if (newVal && newVal instanceof CalendarDate) {
			previousValue = newVal;
			internalValue = newVal;
			value = formatDateStr(newVal);
		} else if (!newVal && previousValue) {
			// Prevent deselection — restore previous value
			internalValue = previousValue;
		}
	}

	function handleOpenChangeComplete(open: boolean) {
		if (!open && internalValue) {
			onSelect?.();
		}
	}

	function formatDisplayDate(compact: boolean) {
		if (!internalValue) return '';
		const date = new Date(internalValue.year, internalValue.month - 1, internalValue.day);
		const opts: Intl.DateTimeFormatOptions = {
			...(compact ? {} : { weekday: 'short' }),
			month: 'short',
			day: 'numeric'
		};
		if (internalValue.year !== currentYear) {
			opts.year = 'numeric';
		}
		return date.toLocaleDateString(locale, opts);
	}
	let displayText = $derived(formatDisplayDate(false));
	let compactText = $derived(formatDisplayDate(true));
</script>

<DatePicker.Root
	bind:value={internalValue}
	bind:open={isOpen}
	onValueChange={handleValueChange}
	onOpenChangeComplete={handleOpenChangeComplete}
	minValue={internalMinValue}
	granularity="day"
	fixedWeeks={true}
	weekdayFormat="short"
	{locale}
	{required}
>
	<DatePicker.Trigger
		aria-label={`${label}: ${displayText || 'Select date'}`}
		class="rounded-ui border-line bg-recess text-ink hover:border-control-hover focus-visible:outline-focus flex h-11 min-w-0 flex-1 cursor-pointer items-center border px-2 text-xs shadow-(--ui-recess-shadow) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 min-[360px]:px-3 min-[360px]:text-sm"
	>
		<span class="truncate select-none">
			{#if displayText}
				<span class="min-[360px]:hidden">{compactText}</span>
				<span class="hidden min-[360px]:inline">{displayText}</span>
			{:else}
				<span class="text-base-400 dark:text-base-500">Select date</span>
			{/if}
		</span>
	</DatePicker.Trigger>

	<DatePicker.Content
		sideOffset={8}
		class="rounded-panel border-line bg-page text-ink z-50 max-w-[calc(100vw-2rem)] border p-3"
	>
		<DatePicker.Calendar>
			{#snippet children({ months, weekdays })}
				<DatePicker.Header class="flex items-center justify-between">
					<DatePicker.PrevButton
						class="text-base-500 hover:bg-base-200 dark:text-base-400 dark:hover:bg-base-700 inline-flex size-8 items-center justify-center rounded-lg"
					>
						<Icon img={ChevronLeft} size={20} />
					</DatePicker.PrevButton>

					<div class="flex items-center gap-1.5">
						<DatePicker.MonthSelect
							monthFormat="long"
							class="text-base-900 dark:text-base-100 hover:text-accent-500 dark:hover:text-accent-400 cursor-pointer border-0 bg-transparent text-sm font-medium outline-none focus:ring-0 focus:outline-none"
						/>
						<DatePicker.YearSelect
							years={yearRange}
							class="text-base-900 dark:text-base-100 hover:text-accent-500 dark:hover:text-accent-400 cursor-pointer border-0 bg-transparent text-sm font-medium outline-none focus:ring-0 focus:outline-none"
						/>
					</div>

					<DatePicker.NextButton
						class="text-base-500 hover:bg-base-200 dark:text-base-400 dark:hover:bg-base-700 inline-flex size-8 items-center justify-center rounded-lg"
					>
						<Icon img={ChevronRight} size={20} />
					</DatePicker.NextButton>
				</DatePicker.Header>

				{#each months as month (month.value.month)}
					<DatePicker.Grid class="mt-3 w-full">
						<DatePicker.GridHead>
							<DatePicker.GridRow class="flex w-full">
								{#each weekdays as weekday, i (i)}
									<DatePicker.HeadCell
										class="text-base-400 dark:text-base-500 flex-1 text-center text-xs font-medium"
									>
										{weekday}
									</DatePicker.HeadCell>
								{/each}
							</DatePicker.GridRow>
						</DatePicker.GridHead>

						<DatePicker.GridBody>
							{#each month.weeks as week, weekIndex (weekIndex)}
								<DatePicker.GridRow class="flex w-full">
									{#each week as day (day.toString())}
										<DatePicker.Cell date={day} month={month.value} class="flex-1 p-0.5">
											<DatePicker.Day>
												{#snippet children({ selected, disabled, day: dayText })}
													<div
														class="relative flex size-9 items-center justify-center rounded-lg text-sm
														{selected
															? 'bg-accent-400 text-base-950 font-medium'
															: disabled
																? 'text-base-300 dark:text-base-600 pointer-events-none'
																: day.month !== month.value.month
																	? 'text-base-300 dark:text-base-600'
																	: 'text-base-700 hover:bg-base-200 dark:text-base-300 dark:hover:bg-base-700'}"
													>
														{dayText}
														{#if day.day === todayDay && day.month === todayMonth && day.year === todayYear}
															<span
																class="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full {selected
																	? 'bg-base-950'
																	: 'bg-accent-500'}"
															></span>
														{/if}
													</div>
												{/snippet}
											</DatePicker.Day>
										</DatePicker.Cell>
									{/each}
								</DatePicker.GridRow>
							{/each}
						</DatePicker.GridBody>
					</DatePicker.Grid>
				{/each}
			{/snippet}
		</DatePicker.Calendar>
	</DatePicker.Content>
</DatePicker.Root>

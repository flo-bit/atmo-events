// SvelteKit browser-test boundary. Real application builds use Kit's virtual modules.
import type { SubmitFunction } from '$app/forms';
import type { Connection } from './connection';

export const page = { url: new URL('https://atmo.rsvp/tools/meet') };
export const navigations: string[] = [];
export const navigationOptions: ({ replace?: boolean; reset?: boolean } | undefined)[] = [];
export const submissions: string[] = [];
export const submissionSources: string[] = [];
export let nextSave: Connection | undefined;
let nextFailure: string | undefined;
export function setNextSave(record: Connection) {
	nextSave = record;
	nextFailure = undefined;
}
export function setNextSaveFailure(message: string) {
	nextFailure = message;
}
export function resolve(route: string, params?: Record<string, string>) {
	return route
		.replace('/(app)', '')
		.replace(/\[([^\]]+)\]/g, (_, key: string) => encodeURIComponent(params?.[key] ?? ''));
}
export async function goto(url: string, options?: { replace?: boolean; reset?: boolean }) {
	navigations.push(url);
	navigationOptions.push(options);
}
let refresh = async () => {};
export function setRefresh(handler: () => Promise<void>) {
	refresh = handler;
}
export async function invalidateAll() {
	await refresh();
}

export function enhance(form: HTMLFormElement, submit?: SubmitFunction) {
	async function handle(event: Event) {
		event.preventDefault();
		const formData = new FormData(form);
		submissions.push(String(formData.get('subject')));
		submissionSources.push(String(formData.get('incomingUri') ?? ''));
		const callback = await submit?.({
			formData,
			formElement: form
		} as Parameters<SubmitFunction>[0]);
		await callback?.({
			result: nextFailure
				? { type: 'failure', status: 502, location: form.action, data: { message: nextFailure } }
				: {
						type: 'success',
						status: 200,
						location: form.action,
						data: { saved: nextSave, alreadyMet: false }
					},
			update: invalidateAll,
			formData,
			formElement: form,
			action: new URL(form.action)
		});
	}
	form.addEventListener('submit', handle);
	return { destroy: () => form.removeEventListener('submit', handle) };
}

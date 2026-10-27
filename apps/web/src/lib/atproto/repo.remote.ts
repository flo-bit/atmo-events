import { error } from '@sveltejs/kit';
import { command, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import { allowedCollections } from './settings';
import { getAuth } from './server/oauth';

async function assertWritePermission(collection: string, action: 'create' | 'update' | 'delete') {
	if (
		collection === 'app.bsky.feed.post' &&
		!(await getAuth().api.can({ type: 'repo', collection, action }))
	) {
		error(403, 'Bluesky posting permission is required');
	}
}

// Validate collection format and check against allowed list from settings
const collectionSchema = v.pipe(
	v.string(),
	v.regex(/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/),
	v.check(
		(c) => allowedCollections.includes(c as (typeof allowedCollections)[number]),
		'Collection not in allowed list'
	)
);

// AT Protocol rkey: TID, 'self', or other valid record keys (alphanumeric, dash, underscore, dot)
const rkeySchema = v.optional(v.pipe(v.string(), v.regex(/^[a-zA-Z0-9._:~-]{1,512}$/)));

export const putRecord = command(
	v.object({
		collection: collectionSchema,
		rkey: rkeySchema,
		record: v.record(v.string(), v.unknown())
	}),
	async (input) => {
		const { locals } = getRequestEvent();
		if (!locals.client || !locals.did) error(401, 'Not authenticated');

		await assertWritePermission(input.collection, 'update');
		const response = await locals.client.post('com.atproto.repo.putRecord', {
			input: {
				collection: input.collection as `${string}.${string}.${string}`,
				repo: locals.did,
				rkey: input.rkey || 'self',
				record: input.record
			}
		});

		if (!response.ok) error(response.status, 'Saving record failed');
		return response.data;
	}
);

export const createRecord = command(
	v.object({
		collection: collectionSchema,
		rkey: rkeySchema,
		record: v.record(v.string(), v.unknown())
	}),
	async (input) => {
		const { locals } = getRequestEvent();
		if (!locals.client || !locals.did) error(401, 'Not authenticated');

		await assertWritePermission(input.collection, 'create');
		const response = await locals.client.post('com.atproto.repo.createRecord', {
			input: {
				collection: input.collection as `${string}.${string}.${string}`,
				repo: locals.did,
				...(input.rkey ? { rkey: input.rkey } : {}),
				record: input.record
			}
		});

		if (!response.ok) error(response.status, 'Creating record failed');
		return response.data;
	}
);

export const deleteRecord = command(
	v.object({
		collection: collectionSchema,
		rkey: rkeySchema
	}),
	async (input) => {
		const { locals } = getRequestEvent();
		if (!locals.client || !locals.did) error(401, 'Not authenticated');

		await assertWritePermission(input.collection, 'delete');
		const response = await locals.client.post('com.atproto.repo.deleteRecord', {
			input: {
				collection: input.collection as `${string}.${string}.${string}`,
				repo: locals.did,
				rkey: input.rkey || 'self'
			}
		});

		if (!response.ok) error(response.status, 'Deleting record failed');
		return { ok: true };
	}
);

export const uploadBlob = command(
	v.object({
		bytes: v.array(v.number()),
		mimeType: v.string()
	}),
	async (input) => {
		const { locals } = getRequestEvent();
		if (!locals.client || !locals.did) error(401, 'Not authenticated');

		const blob = new Blob([new Uint8Array(input.bytes)], { type: input.mimeType });

		const response = await locals.client.post('com.atproto.repo.uploadBlob', {
			params: { repo: locals.did },
			input: blob
		});

		if (!response.ok) error(500, 'Upload failed');

		return response.data.blob as {
			$type: 'blob';
			ref: { $link: string };
			mimeType: string;
			size: number;
		};
	}
);

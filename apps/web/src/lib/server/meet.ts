import type { Client } from '@atcute/client';
import type { Did } from '@atcute/lexicons';
import { isDatetime, isDid } from '@atcute/lexicons/syntax';
import {
	CONNECTION_COLLECTION,
	incomingConnectionRkey,
	type Connection
} from '#lib/meet/connection.js';
import { serviceUrl } from '#lib/atproto/network.js';

/** Read the public source record, not a browser-supplied timestamp or backlink hint. */
export async function incomingMeetingDate(
	uri: string,
	owner: Did,
	viewer: Did,
	fetcher: typeof fetch
): Promise<string> {
	const rkey = incomingConnectionRkey(uri, owner);
	if (!rkey) throw new Error('Invalid original meeting');
	// The network's repo gateway (Slingshot, a deployment setting) avoids fetching user-controlled
	// PDS URLs or sending OAuth credentials.
	const url = new URL(`${serviceUrl('slingshot')}/xrpc/com.atproto.repo.getRecord`);
	url.search = new URLSearchParams({
		repo: owner,
		collection: CONNECTION_COLLECTION,
		rkey
	}).toString();
	const response = await fetcher(url, {
		signal: AbortSignal.timeout(5000),
		// Workers only supports follow/manual; response.ok rejects redirects below.
		redirect: 'manual',
		credentials: 'omit'
	});
	if (!response.ok) throw new Error('Could not read original meeting');
	const data = (await response.json()) as { uri?: unknown; value?: Record<string, unknown> };
	if (
		data.uri !== uri ||
		data.value?.$type !== CONNECTION_COLLECTION ||
		data.value.subject !== viewer ||
		!isDatetime(data.value.createdAt)
	) {
		throw new Error('Invalid original meeting');
	}
	return data.value.createdAt;
}

/** Read the complete collection; a failed read must never mean “not met yet”. */
export async function listConnections(client: Client, did: Did): Promise<Connection[]> {
	const records: Connection[] = [];
	let cursor: string | undefined;
	const seen = new Set<string>();
	for (let page = 0; page < 50; page++) {
		const response = await client.get('com.atproto.repo.listRecords', {
			params: { repo: did, collection: CONNECTION_COLLECTION, limit: 100, reverse: true, cursor }
		});
		if (!response.ok) throw new Error('Could not load meetings');
		for (const record of response.data.records) {
			const value = record.value as Record<string, unknown>;
			if (
				value.$type === CONNECTION_COLLECTION &&
				isDid(value.subject) &&
				typeof value.createdAt === 'string'
			) {
				records.push({
					uri: record.uri,
					owner: did,
					subject: value.subject,
					createdAt: value.createdAt
				});
			}
		}
		cursor = response.data.cursor;
		if (!cursor) return records;
		if (seen.has(cursor)) throw new Error('Repeated meetings cursor');
		seen.add(cursor);
	}
	throw new Error('Too many meetings to load');
}

/** Backlinks recover encounters missed while this page was closed. No credentials leave the PDS. */
export async function listIncomingConnections(
	did: Did,
	fetcher: typeof fetch
): Promise<Connection[]> {
	const records: Connection[] = [];
	let cursor: string | undefined;
	const seen = new Set<string>();
	for (let page = 0; page < 50; page++) {
		const url = new URL(`${serviceUrl('constellation')}/xrpc/blue.microcosm.links.getBacklinks`);
		url.search = new URLSearchParams({
			subject: did,
			source: `${CONNECTION_COLLECTION}:subject`,
			limit: '100',
			...(cursor ? { cursor } : {})
		}).toString();
		const response = await fetcher(url, {
			signal: AbortSignal.timeout(5000),
			redirect: 'manual',
			credentials: 'omit'
		});
		if (!response.ok) throw new Error('Could not load incoming meetings');
		const data = (await response.json()) as {
			records?: { did: unknown; collection: unknown; rkey: unknown }[];
			cursor?: string;
		};
		if (!Array.isArray(data.records)) throw new Error('Invalid backlinks response');
		for (const record of data.records) {
			if (
				!isDid(record.did) ||
				record.collection !== CONNECTION_COLLECTION ||
				typeof record.rkey !== 'string' ||
				!/^[a-zA-Z0-9._:~-]{1,512}$/.test(record.rkey)
			)
				continue;
			records.push({
				uri: `at://${record.did}/${CONNECTION_COLLECTION}/${record.rkey}`,
				owner: record.did,
				subject: did,
				createdAt: ''
			});
		}
		cursor = data.cursor;
		if (!cursor) return records;
		if (seen.has(cursor)) throw new Error('Repeated backlinks cursor');
		seen.add(cursor);
	}
	throw new Error('Too many incoming meetings to load');
}

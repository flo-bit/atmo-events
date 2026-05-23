import type { Did } from '@atcute/lexicons';
import { getServerClient } from '$lib/contrail';
import { MAX_MENTIONS_PER_RUN, NOTIF_LIMIT, REPLIES } from './config';
import { getBotHandle, type BotHandle } from './session';
import {
	ensureBotSchema,
	getProcessed,
	recordOutcome,
	repliedNoEventRecently,
	repliedNoTokenRecently
} from './db';
import { likePost, replyToPost, type PostRef } from './actions';
import { findEventLink, loadEvent, resolveActorDid, type BotPostRecord } from './resolve-event';
import { rsvpOnBehalf } from './rsvp';

/** The notification fields we rely on (structurally compatible with the lexicon type). */
type Mention = {
	uri: string;
	cid: string;
	reason: string;
	author: { did: Did };
	record: unknown;
};

/**
 * Poll the bot's mentions and act on each new one: RSVP the replier and like
 * their post, or reply with a hint. Wrapped per-mention so one failure can't
 * stall the batch; unrecorded failures are retried on the next tick.
 */
export async function processBotMentions(env: App.Platform['env'], db: D1Database): Promise<void> {
	const bot = await getBotHandle(env);
	if (!bot) return;

	await ensureBotSchema(db);

	try {
		const res = await bot.client.get('app.bsky.notification.listNotifications', {
			params: { limit: NOTIF_LIMIT }
		});
		if (!res.ok) {
			console.warn('[bot] listNotifications failed:', res.status);
			return;
		}

		const mentions = (res.data.notifications ?? []).filter(
			(n) => n.reason === 'mention' && n.author.did !== bot.did
		) as Mention[];
		if (mentions.length === 0) return;

		const processed = await getProcessed(
			db,
			mentions.map((n) => n.uri)
		);
		const todo = mentions.filter((n) => !processed.has(n.uri)).slice(0, MAX_MENTIONS_PER_RUN);

		for (const mention of todo) {
			try {
				await handleMention(env, db, bot, mention);
			} catch (e) {
				// Leave unrecorded so the next tick retries this mention.
				console.error('[bot] failed to handle mention', mention.uri, e);
			}
		}
	} finally {
		await bot.flush();
	}
}

async function handleMention(
	env: App.Platform['env'],
	db: D1Database,
	bot: BotHandle,
	mention: Mention
): Promise<void> {
	const serverClient = getServerClient(db);
	const record = mention.record as BotPostRecord;
	const authorDid = mention.author.did;

	const parent: PostRef = { uri: mention.uri, cid: mention.cid };
	const root: PostRef = record.reply?.root ?? parent;
	const reply = (text: string) => replyToPost(bot.client, bot.did, { root, parent, text });

	const replyNoEvent = async () => {
		if (await repliedNoEventRecently(db, authorDid)) {
			await recordOutcome(db, { notifUri: mention.uri, authorDid, outcome: 'skipped_cooldown' });
			return;
		}
		await reply(REPLIES.noEvent);
		await recordOutcome(db, { notifUri: mention.uri, authorDid, outcome: 'replied_no_event' });
	};

	// 1. Find the event link (mention → parent → root).
	const link = await findEventLink(bot.client, record);
	if (!link) return replyNoEvent();

	// 2. Resolve it to an indexed event (with cid + external-RSVP signal).
	const did = await resolveActorDid(bot.client, link.actor);
	const event = did ? await loadEvent(serverClient, did, link.rkey) : null;
	if (!event) return replyNoEvent();

	// 3. External-only events can't be RSVP'd here — point them at the source.
	if (event.externalOnly) {
		await reply(
			event.externalRsvpUrl
				? REPLIES.external(event.externalRsvpUrl)
				: 'RSVPs for this event are handled on the original site.'
		);
		await recordOutcome(db, {
			notifUri: mention.uri,
			authorDid,
			outcome: 'replied_external',
			eventUri: event.uri
		});
		return;
	}

	// 4. RSVP on the replier's behalf.
	const result = await rsvpOnBehalf(env, serverClient, authorDid, event);

	if (result === 'ok') {
		await likePost(bot.client, bot.did, parent);
		await recordOutcome(db, {
			notifUri: mention.uri,
			authorDid,
			outcome: 'liked',
			eventUri: event.uri
		});
		return;
	}

	if (result === 'no-token') {
		if (await repliedNoTokenRecently(db, authorDid)) {
			await recordOutcome(db, {
				notifUri: mention.uri,
				authorDid,
				outcome: 'skipped_cooldown',
				eventUri: event.uri
			});
			return;
		}
		await reply(REPLIES.noToken);
		await recordOutcome(db, {
			notifUri: mention.uri,
			authorDid,
			outcome: 'replied_no_token',
			eventUri: event.uri
		});
		return;
	}

	// Transient error — throw so this mention stays unrecorded and is retried.
	throw new Error(`transient RSVP failure for ${mention.uri}`);
}

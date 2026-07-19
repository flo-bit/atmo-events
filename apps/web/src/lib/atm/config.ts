// Atmosphere Money (ATM) ticketing — shared config.
//
// Opt-in integration: every ATM surface (availability on event pages, the buy
// flow, the webhook receiver) no-ops unless the ATM_* vars/secrets below are
// set on the Worker, so an unconfigured deployment behaves exactly as before.
// Setup steps live in the README ("ATM ticketing (experimental)").

import {
	ATM_BROKER_SERVICE_AUDIENCE,
	DEFAULT_ATM_APPVIEW_URL,
	DEFAULT_ATM_BROKER_URL,
	type AtmEnvironment
} from './sdk';

type Env = App.Platform['env'];

/** PDS the ATM app account authenticates against when none is configured. */
const DEFAULT_ATM_APP_PDS = 'https://bsky.social';

export type AtmConfig = {
	/** Handle or DID the app signs in to its PDS as (`ATM_APP_IDENTIFIER`). */
	identifier: string;
	/** App password for that account (`ATM_APP_PASSWORD`, a Worker secret). */
	password: string;
	/** PDS base URL for the app account (`ATM_APP_PDS_URL`). */
	pdsUrl: string;
	/** Optional sanity pin: the DID registered with ATM (`ATM_APP_DID`). */
	appDid?: string;
	/** ATM environment every call is scoped to (`ATM_ENVIRONMENT`, default `test`). */
	environment: AtmEnvironment;
	/** ATM broker base URL (`ATM_BROKER_URL`). */
	brokerUrl: string;
	/** ATM AppView base URL (`ATM_APPVIEW_URL`). */
	appViewUrl: string;
	/** Service-scoped audience for every service-auth token we mint. */
	serviceAudience: string;
};

/**
 * Build the ATM config from Worker env, or null when the integration is off
 * (no app identifier/password). Callers treat null as "feature disabled".
 */
export function getAtmConfig(env: Env): AtmConfig | null {
	const identifier = env.ATM_APP_IDENTIFIER;
	const password = env.ATM_APP_PASSWORD;
	if (!identifier || !password) return null;
	return {
		identifier,
		password,
		pdsUrl: env.ATM_APP_PDS_URL || DEFAULT_ATM_APP_PDS,
		appDid: env.ATM_APP_DID || undefined,
		environment: env.ATM_ENVIRONMENT === 'live' ? 'live' : 'test',
		brokerUrl: env.ATM_BROKER_URL || DEFAULT_ATM_BROKER_URL,
		appViewUrl: env.ATM_APPVIEW_URL || DEFAULT_ATM_APPVIEW_URL,
		serviceAudience: ATM_BROKER_SERVICE_AUDIENCE
	};
}

/** True when the deployment can make app-authenticated ATM calls. */
export function atmConfigured(env: Env): boolean {
	return !!env.ATM_APP_IDENTIFIER && !!env.ATM_APP_PASSWORD;
}

/** True when the deployment can verify inbound ATM webhooks. */
export function atmWebhookConfigured(env: Env): boolean {
	return !!env.ATM_WEBHOOK_SECRET;
}

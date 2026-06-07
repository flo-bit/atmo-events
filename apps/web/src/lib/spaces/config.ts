import type { SpacesConfig } from '@atmo-dev/contrail';
import { SERVICE_DID, SERVICE_URL } from './tunnel-service.generated';

/** The NSID identifying our kind of permissioned space. */
export const SPACE_TYPE = 'tools.atmo.event.space';

/** Build the spaces config for contrail, or null if we can't run spaces
 *  (no service DID => dev without tunnel, prod before service is published). */
export function getSpacesConfig(): SpacesConfig | null {
	if (!SERVICE_DID) {
		return null;
	}
	// contrail 0.9 split SpacesConfig into authority (member list / credentials /
	// space management) and recordHost (record + blob storage). type+serviceDid
	// moved under `authority`. `recordHost` must be present for record-host XRPC
	// routes to register — without it space records can't be read/written. We
	// store blobs on the PDS (scope.blob in atproto/settings), so no blob adapter.
	return {
		authority: {
			type: SPACE_TYPE,
			serviceDid: SERVICE_DID
		},
		recordHost: {}
	};
}

/** True if spaces are available in this environment. */
export function spacesAvailable(): boolean {
	return SERVICE_DID != null;
}

export { SERVICE_DID, SERVICE_URL };

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
	return {
		type: SPACE_TYPE,
		serviceDid: SERVICE_DID
	};
}

/** True if spaces are available in this environment. */
export function spacesAvailable(): boolean {
	return SERVICE_DID != null;
}

export { SERVICE_DID, SERVICE_URL };

import {
	Captions,
	CaptionsOff,
	Maximize,
	Minimize,
	Pause,
	Play,
	Settings,
	Volume2,
	VolumeX
} from '@sketchyicons/svelte';
import type Plyr from 'plyr';

const prefix = 'atmo-sketchy-plyr';
const icons = {
	play: Play,
	pause: Pause,
	volume: Volume2,
	muted: VolumeX,
	'captions-on': Captions,
	'captions-off': CaptionsOff,
	'enter-fullscreen': Maximize,
	'exit-fullscreen': Minimize,
	settings: Settings
};

/** Called in the browser before constructing either video player. */
export function sketchyPlyrIcons(): Pick<Plyr.Options, 'iconPrefix' | 'iconUrl' | 'loadSprite'> {
	// One local sprite serves every player, without fetching Plyr's stock CDN icons.
	if (!document.getElementById(prefix)) {
		const ns = 'http://www.w3.org/2000/svg';
		const sprite = document.createElementNS(ns, 'svg');
		sprite.id = prefix;
		sprite.setAttribute('width', '0');
		sprite.setAttribute('height', '0');
		sprite.setAttribute('aria-hidden', 'true');
		sprite.setAttribute('focusable', 'false');
		sprite.style.position = 'absolute';

		for (const [name, nodes] of Object.entries(icons)) {
			const symbol = document.createElementNS(ns, 'symbol');
			symbol.id = `${prefix}-${name}`;
			symbol.setAttribute('viewBox', '0 0 24 24');
			symbol.setAttribute('stroke', 'currentColor');
			symbol.setAttribute('stroke-width', '1.75');
			symbol.setAttribute('stroke-linecap', 'round');
			symbol.setAttribute('stroke-linejoin', 'round');
			for (const [, attributes] of nodes) {
				const path = document.createElementNS(ns, 'path');
				path.setAttribute('d', String(attributes.d));
				path.setAttribute('fill', String(attributes.fill ?? 'none'));
				symbol.appendChild(path);
			}
			sprite.appendChild(symbol);
		}
		document.body.appendChild(sprite);
	}

	// An empty iconUrl makes Plyr reference the local symbols by fragment only.
	return { iconPrefix: prefix, iconUrl: '', loadSprite: false };
}

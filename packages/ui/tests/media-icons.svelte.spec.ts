import { afterEach, describe, expect, it } from 'vitest';
import { Play } from '@sketchyicons/svelte';
import { sketchyPlyrIcons } from '../src/event-view/plyr-icons.js';
import 'plyr/dist/plyr.css';

describe('hand-drawn media controls', () => {
	let destroy: (() => void) | undefined;
	let container: HTMLDivElement | undefined;

	afterEach(() => {
		destroy?.();
		container?.remove();
		document.getElementById('atmo-sketchy-plyr')?.remove();
	});

	it('shares one local Sketchyicons sprite and renders all live/VOD control states', async () => {
		const options = sketchyPlyrIcons();
		expect(options).toEqual({
			iconPrefix: 'atmo-sketchy-plyr',
			iconUrl: '',
			loadSprite: false
		});
		sketchyPlyrIcons();
		expect(document.querySelectorAll('#atmo-sketchy-plyr')).toHaveLength(1);
		expect(document.querySelector('#atmo-sketchy-plyr-play path')?.getAttribute('d')).toBe(
			String(Play[0][1].d)
		);

		container = document.createElement('div');
		container.style.width = '640px';
		const video = document.createElement('video');
		container.appendChild(video);
		document.body.appendChild(container);
		const { default: Plyr } = await import('plyr');
		const player = new Plyr(video, {
			...options,
			controls: ['play-large', 'play', 'mute', 'volume', 'captions', 'settings', 'fullscreen'],
			settings: ['captions', 'speed'],
			ratio: '16:9'
		});
		destroy = () => player.destroy();

		await expect.poll(() => container!.querySelectorAll('svg use').length).toBeGreaterThan(0);
		const references = [...container.querySelectorAll('svg use')].map(
			(use) => use.getAttribute('href') ?? use.getAttribute('xlink:href')
		);
		for (const name of [
			'play',
			'pause',
			'volume',
			'muted',
			'captions-on',
			'captions-off',
			'settings',
			'enter-fullscreen',
			'exit-fullscreen'
		]) {
			expect(references).toContain(`#atmo-sketchy-plyr-${name}`);
			expect(
				document.getElementById(`atmo-sketchy-plyr-${name}`)?.querySelector('path')
			).not.toBeNull();
		}
		await expect
			.poll(
				() =>
					container!.querySelector<SVGSVGElement>('.plyr__control--overlaid svg')!.getBBox().width
			)
			.toBeGreaterThan(0);
	});
});

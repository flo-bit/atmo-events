export interface EventTheme {
	name: string;
	accentColor: string;
	baseColor: string;
}

export const accentColors = [
	'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
	'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
	'fuchsia', 'pink', 'rose'
] as const;

export const defaultTheme: EventTheme = {
	name: 'minimal',
	accentColor: 'cyan',
	baseColor: 'mist'
};

export function randomAccentColor(): string {
	return accentColors[Math.floor(Math.random() * accentColors.length)];
}

export const themeBackgrounds: Record<string, string> = {
	minimal: 'Minimal',
	blobs: 'Blobs',
	warp: 'Stars',
	matrix: 'Matrix',
	fireflies: 'Fireflies',
	kaleidoscope: 'Kaleidoscope'
};

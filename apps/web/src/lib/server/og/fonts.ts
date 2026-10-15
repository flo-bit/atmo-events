import regular from './fonts/NotoSans-Regular.ttf?inline';
import bold from './fonts/NotoSans-Bold.ttf?inline';

function decode(dataUrl: string): ArrayBuffer {
	const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
	return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)).buffer;
}

// Inline assets are bundled into the Worker, not fetched over the network.
// Keep the old renderer's font names/weights for identical layout.
const fonts = [
	{ name: 'Inter', weight: 400 as const, style: 'normal' as const, data: decode(regular) },
	{ name: 'Inter', weight: 700 as const, style: 'normal' as const, data: decode(bold) }
];

export function ogFonts() {
	return fonts;
}

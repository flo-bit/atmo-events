const { existsSync, readFileSync, realpathSync } = require('node:fs');
const { join, resolve } = require('node:path');

function localKitPath() {
	if (process.env.CI && !['false', '0'].includes(process.env.CI.toLowerCase())) {
		throw new Error('Local kit mode is disabled in CI. Use the committed registry dependencies.');
	}

	const root = resolve(__dirname, '..');
	const directory = resolve(root, process.env.ATMO_KIT_PATH || '../00-atmo-kit/kit');
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
	} catch {
		throw new Error(`No kit checkout at ${directory}. Set ATMO_KIT_PATH to its package directory.`);
	}
	if (manifest.name !== '@atmo-dev/kit') {
		throw new Error(`${directory} is not an @atmo-dev/kit package.`);
	}
	for (const file of ['dist/index.js', 'dist/index.d.ts', 'dist/theme.css']) {
		if (!existsSync(join(directory, file))) {
			throw new Error(
				`Missing ${file} in ${directory}. Run pnpm install and pnpm prepack there first.`
			);
		}
	}
	return realpathSync(directory);
}

module.exports = {
	localKitPath,
	hooks: {
		updateConfig(config) {
			return {
				...config,
				// Keep reading the committed graph, but save only the node_modules state.
				// Unlike --no-lockfile, this retains locked versions of unrelated packages.
				useLockfile: true,
				saveLockfile: false,
				frozenLockfile: false,
				overrides: {
					...config.overrides,
					'@atmo-dev/kit': `link:${localKitPath()}`
				}
			};
		}
	}
};

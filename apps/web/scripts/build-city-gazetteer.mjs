// Generate the bundled GeoNames city index from the public cities15000.txt and
// admin1CodesASCII.txt downloads. See src/lib/server/geonames/README.md.
//
// Output is tab-separated text, kept compact because it ships inside the Worker:
//   regions.tsv: CC.code, name, ascii?
//   cities.tsv:  name, country, regionCode, lat, lon, ascii?
// ASCII names are omitted when equal to the primary name; only regions used by
// a city are kept; coordinates are rounded to 2 decimals (~1 km), plenty for
// city-level distances.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [citiesPath, regionsPath, outputDir] = process.argv.slice(2);
if (!citiesPath || !regionsPath || !outputDir) {
	console.error(
		'Usage: node scripts/build-city-gazetteer.mjs cities15000.txt admin1CodesASCII.txt output-dir'
	);
	process.exit(1);
}
const round = (value) => Math.round(Number(value) * 100) / 100;
const names = (name, ascii) => (ascii && ascii !== name ? [name, ascii] : [name]);

const allRegions = new Map(
	readFileSync(regionsPath, 'utf8')
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => {
			const [key, name, ascii] = line.split('\t');
			return [key, names(name, ascii)];
		})
);
const regions = new Map();
const cities = readFileSync(citiesPath, 'utf8')
	.split(/\r?\n/)
	.filter(Boolean)
	.map((line) => {
		const [, name, ascii, , latitude, longitude, , , country, , region] = line.split('\t');
		const key = `${country}.${region}`;
		if (allRegions.has(key)) regions.set(key, allRegions.get(key));
		const entry = [name, country, region, round(latitude), round(longitude)];
		if (ascii && ascii !== name) entry.push(ascii);
		return entry.join('\t');
	});
const tsv = (rows) => rows.join('\n') + '\n';
writeFileSync(
	join(outputDir, 'regions.tsv'),
	tsv([...regions].map(([key, values]) => [key, ...values].join('\t')))
);
writeFileSync(join(outputDir, 'cities.tsv'), tsv(cities));
console.log(`Wrote ${cities.length} cities and ${regions.size} regions to ${outputDir}`);

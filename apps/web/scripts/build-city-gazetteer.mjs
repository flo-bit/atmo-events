// Generate the bundled GeoNames city index from the public cities15000.txt and
// admin1CodesASCII.txt downloads. See src/lib/server/geonames/README.md.
import { readFileSync, writeFileSync } from 'node:fs';

const [citiesPath, regionsPath, outputPath] = process.argv.slice(2);
if (!citiesPath || !regionsPath || !outputPath) {
	console.error(
		'Usage: node scripts/build-city-gazetteer.mjs cities15000.txt admin1CodesASCII.txt output.json'
	);
	process.exit(1);
}
const regions = new Map(
	readFileSync(regionsPath, 'utf8')
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => {
			const [key, name, ascii] = line.split('\t');
			return [key, [name, ascii]];
		})
);
const cities = readFileSync(citiesPath, 'utf8')
	.split(/\r?\n/)
	.filter(Boolean)
	.map((line) => {
		const fields = line.split('\t');
		const [, name, ascii, , latitude, longitude, , , country, , region] = fields;
		const [regionName = '', regionAscii = ''] = regions.get(`${country}.${region}`) ?? [];
		return [
			name,
			ascii,
			country,
			region,
			regionName,
			regionAscii,
			Number(latitude),
			Number(longitude)
		];
	});
writeFileSync(outputPath, JSON.stringify(cities));
console.log(`Wrote ${cities.length} cities to ${outputPath}`);

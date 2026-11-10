# City gazetteer

`cities.json` is derived from [GeoNames](https://www.geonames.org/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It contains cities with populations over 15,000 and some administrative centers, so smaller towns may be absent. Source files are `cities15000.zip` and `admin1CodesASCII.txt` from https://download.geonames.org/export/dump/. The bundled data was downloaded on 2026-11-06.

To update, extract `cities15000.txt` from the ZIP and run:

```sh
node scripts/build-city-gazetteer.mjs cities15000.txt admin1CodesASCII.txt src/lib/server/geonames/cities.json
```

/** Missing preferences are discoverable. JSON false and numeric zero are not. */
export function discoverableSql(recordCol: string): string {
	return `(json_extract(${recordCol}, '$.preferences.showInDiscovery') IS NULL
		OR json_extract(${recordCol}, '$.preferences.showInDiscovery') != 0)`;
}

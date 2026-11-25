// Rebuilds data/vehicles.json from a pinned OpenEV Data release (CDLA-Permissive-2.0).
// Usage: pnpm --filter @pitwall/ev-data build:data [path of an already downloaded JSON]
import { readFile, writeFile } from 'node:fs/promises';

const VERSION = 'v1.24.0';
const SOURCE = `https://github.com/open-ev-data/open-ev-data-dataset/releases/download/${VERSION}/open-ev-data-${VERSION}.json`;
const local = process.argv[2];
const data = JSON.parse(local ? await readFile(local, 'utf8') : await (await fetch(SOURCE)).text());

const vehicles = data.vehicles
  .map((v) => {
    const usableKwh = v.battery?.pack_capacity_kwh_net ?? v.battery?.pack_capacity_kwh_gross;
    const rated = v.range?.rated?.find((r) => r.cycle === 'wltp') ?? v.range?.rated?.[0];
    const name = [v.make?.name, v.model?.name, v.variant?.name ?? v.trim?.name].filter(Boolean).join(' ');
    return {
      id: v.unique_code,
      name: `${name} (${v.year})`,
      usableKwh,
      ...(v.charging?.dc?.max_power_kw ? { maxDcKw: v.charging.dc.max_power_kw } : {}),
      // Rated consumption derived from capacity and range; real driving usually needs more.
      ...(rated?.range_km ? { consumptionWhKm: Math.round((usableKwh * 1000) / rated.range_km) } : {}),
    };
  })
  .filter((v) => v.id && v.usableKwh)
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

await writeFile(new URL('../data/vehicles.json', import.meta.url), JSON.stringify(vehicles));
console.log(VERSION, vehicles.length, 'vehicles,', vehicles.filter((v) => v.consumptionWhKm).length, 'with range');

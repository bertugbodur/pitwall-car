// Rebuilds data/obdex-*.json from a pinned OBDex commit (data: CC0-1.0).
// Usage: pnpm --filter @pitwall/dtc-data build:data [folder with already downloaded YAML]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const COMMIT = '9ba1ffa095f3140d9e21b985b322ddea3134bb60';
const SOURCE = `https://raw.githubusercontent.com/foerbsnavi/OBDex/${COMMIT}/data/generic`;
const FILES = ['P0xxx', 'P2xxx', 'P3xxx', 'B0xxx', 'C0xxx', 'U0xxx', 'U3xxx'];
const local = process.argv[2];

/** Keeps whole sentences up to roughly this length, to keep the bundle small. */
const shorten = (text, limit = 360) => {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const end = cut.lastIndexOf('. ');
  return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
};

for (const name of FILES) {
  const text = local
    ? await readFile(join(local, `${name}.yaml`), 'utf8')
    : await (await fetch(`${SOURCE}/${name}_enriched.yaml`)).text();
  const document = parse(text);
  const records = Array.isArray(document) ? document : (document.codes ?? Object.values(document)[0]);
  const out = {};
  for (const r of records) {
    // [title, description, causes, symptoms]; causes are ordered most likely first by OBDex.
    out[r.code] = [
      r.title.en,
      shorten((r.description?.en ?? '').replace(/s+/g, ' ').trim()),
      (r.common_causes ?? []).map((c) => c.label?.en).filter(Boolean),
      (r.symptoms ?? []).map((s) => s.en).filter(Boolean),
    ];
  }
  await writeFile(new URL(`../data/obdex-${name.slice(0, 2)}.json`, import.meta.url), JSON.stringify(out));
  console.log(name, Object.keys(out).length);
}

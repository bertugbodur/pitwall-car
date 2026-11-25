/** Offline trouble code descriptions: OBDex (CC0) in English, our own Turkish texts (CC0). */
import { isManufacturerSpecific } from '@pitwall/obd-core';
import turkish from '../data/dtc-tr.json';

export interface DtcText {
  title: string;
  description: string;
  causes: string[];
  symptoms: string[];
}

export interface DtcInfo {
  code: string;
  manufacturerSpecific: boolean;
  en?: DtcText;
  tr?: DtcText;
}

type Compact = Record<string, [string, string, string[], string[]]>;
type Turkish = Record<string, { title: string; description: string; causes: string[] }>;

const TR = turkish as Turkish;
export const TURKISH_CODES: readonly string[] = Object.keys(TR);

// Loaded on demand so the first page view does not carry the whole database.
const CHUNKS: Record<string, () => Promise<{ default: unknown }>> = {
  P0: () => import('../data/obdex-P0.json'),
  P2: () => import('../data/obdex-P2.json'),
  P3: () => import('../data/obdex-P3.json'),
  B0: () => import('../data/obdex-B0.json'),
  C0: () => import('../data/obdex-C0.json'),
  U0: () => import('../data/obdex-U0.json'),
  U3: () => import('../data/obdex-U3.json'),
};

const loaded = new Map<string, Promise<Compact>>();

function chunk(code: string): Promise<Compact> {
  const prefix = code.slice(0, 2);
  let data = loaded.get(prefix);
  if (!data) {
    data = CHUNKS[prefix]?.().then((m) => m.default as Compact) ?? Promise.resolve({});
    loaded.set(prefix, data);
  }
  return data;
}

export async function describeDtc(code: string): Promise<DtcInfo> {
  const manufacturerSpecific = isManufacturerSpecific(code);
  const info: DtcInfo = { code, manufacturerSpecific };
  if (manufacturerSpecific) return info;
  const english = (await chunk(code))[code];
  if (english) {
    const [title, description, causes, symptoms] = english;
    info.en = { title, description, causes, symptoms };
  }
  const own = TR[code];
  if (own) info.tr = { ...own, symptoms: [] };
  return info;
}

/** Looks a code up by its identifier or by words in its title. */
export async function searchDtc(query: string, language: 'tr' | 'en', limit = 20): Promise<{ code: string; title: string }[]> {
  const needle = query.trim().toLocaleLowerCase(language);
  if (needle.length < 2) return [];
  if (/^[pcbu][0-9a-f]{4}$/.test(needle)) {
    const info = await describeDtc(needle.toUpperCase());
    const text = info[language] ?? info.en;
    return text ? [{ code: info.code, title: text.title }] : [];
  }
  const entries: [string, string][] =
    language === 'tr'
      ? TURKISH_CODES.map((code) => [code, TR[code]!.title])
      : Object.entries(await chunk('P0')).map(([code, value]) => [code, value[0]]);
  return entries
    .filter(([code, title]) => `${code} ${title}`.toLocaleLowerCase(language).includes(needle))
    .slice(0, limit)
    .map(([code, title]) => ({ code, title }));
}

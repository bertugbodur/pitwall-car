/** Trip summaries the web app shares with the bridge, so MCP clients can read them. No positions. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface TripSummary {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceKm: number;
  avgSpeed: number;
  fuelL?: number;
  avgConsumption?: number;
  idleSec: number;
  maxCoolantC: number;
}

export const defaultDataDir = (): string => join(homedir(), '.pitwall-car');

const FIELDS = ['startedAt', 'endedAt', 'distanceKm', 'avgSpeed', 'fuelL', 'avgConsumption', 'idleSec', 'maxCoolantC'] as const;
const KEEP = 50;

/** Copies only the known numeric fields, so a position can never end up on disk. */
function clean(input: unknown): TripSummary | undefined {
  const trip = input as Record<string, unknown> | null;
  if (!trip || typeof trip.id !== 'string' || typeof trip.startedAt !== 'number') return undefined;
  const out: Record<string, unknown> = { id: trip.id.slice(0, 40) };
  for (const field of FIELDS) if (typeof trip[field] === 'number') out[field] = trip[field];
  return out as unknown as TripSummary;
}

export async function readTrips(dir: string): Promise<TripSummary[]> {
  try {
    return JSON.parse(await readFile(join(dir, 'trips.json'), 'utf8')) as TripSummary[];
  } catch {
    return [];
  }
}

export async function saveTrips(dir: string, trips: readonly unknown[]): Promise<void> {
  const list = trips
    .flatMap((t) => clean(t) ?? [])
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, KEEP);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'trips.json'), JSON.stringify(list, null, 1));
}

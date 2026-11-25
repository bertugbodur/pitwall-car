/** Everything about the car stays on this device, in IndexedDB. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Trip } from './trip.ts';

interface Schema extends DBSchema {
  trips: { key: string; value: Trip };
  cache: { key: string; value: { at: number; data: unknown } };
}

let opened: Promise<IDBPDatabase<Schema>> | undefined;

const db = () =>
  (opened ??= openDB<Schema>('pitwall', 1, {
    upgrade(database) {
      database.createObjectStore('trips', { keyPath: 'id' });
      database.createObjectStore('cache');
    },
  }));

export const saveTrip = async (trip: Trip): Promise<void> => void (await (await db()).put('trips', trip));

export const listTrips = async (): Promise<Trip[]> =>
  (await (await db()).getAll('trips')).sort((a, b) => b.startedAt - a.startedAt);

export const deleteTrip = async (id: string): Promise<void> => (await db()).delete('trips', id);

/** Returns a stored answer while it is fresh, otherwise loads and stores it. */
export async function cached<T>(key: string, maxAgeMs: number, load: () => Promise<T>): Promise<T> {
  const database = await db();
  const hit = await database.get('cache', key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.data as T;
  const data = await load();
  await database.put('cache', { at: Date.now(), data }, key);
  return data;
}

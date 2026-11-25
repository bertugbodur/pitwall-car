/** How long a reading stays valid without a new answer from the car. */
const FAST = new Set(['0B', '0C', '0D', '10']);
// Generous: slow clone adapters take several seconds to come round to a PID again.
const FAST_MS = 12_000;
const OTHER_MS = 20_000;

export const staleKeys = (stamps: Readonly<Record<string, number>>, now: number): string[] =>
  Object.keys(stamps).filter((key) => now - stamps[key]! > (FAST.has(key) ? FAST_MS : OTHER_MS));

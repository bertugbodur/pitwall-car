import type { Dtc } from '@pitwall/obd-core';
import { OVERHEAT_C, type Level } from './alerts.ts';

export interface HealthInput {
  /** Undefined until the codes have been read. */
  dtcs: readonly Dtc[] | undefined;
  milOn?: boolean;
  coolant?: number;
}

const PENALTY = { stored: 20, pending: 8, permanent: 5 } as const;

/**
 * A rough summary for the home screen, not a diagnosis:
 * 100 minus penalties per code, the warning lamp and overheating.
 */
export function healthScore({ dtcs, milOn, coolant }: HealthInput): { score: number; level: Level } | undefined {
  if (!dtcs) return undefined;
  const overheating = coolant !== undefined && coolant >= OVERHEAT_C;
  const critical = dtcs.some((d) => d.safetyCritical);
  let score = 100;
  for (const dtc of dtcs) score -= PENALTY[dtc.kind] + (dtc.safetyCritical ? 25 : 0);
  if (milOn) score -= 10;
  if (overheating) score -= 40;
  score = Math.max(0, score);
  const level: Level = critical || overheating || score < 50 ? 'danger' : score < 85 ? 'warn' : 'ok';
  return { score, level };
}

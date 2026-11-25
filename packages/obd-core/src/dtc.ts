export type DtcKind = 'stored' | 'pending' | 'permanent';

export interface Dtc {
  code: string;
  kind: DtcKind;
  description?: { en?: string; tr?: string };
  safetyCritical: boolean;
}

export const DTC_MODES = { stored: 0x03, pending: 0x07, permanent: 0x0a } as const satisfies Record<DtcKind, number>;

export function decodeDtc(a: number, b: number): string {
  const system = 'PCBU'[a >> 6]!;
  const rest = [(a >> 4) & 0x3, a & 0xf, b >> 4, b & 0xf];
  return system + rest.map((n) => n.toString(16).toUpperCase()).join('');
}

/**
 * CAN answers are `4x <count> <pairs>`. Older protocols send `4x` followed by three
 * code slots per line, padded with zeros.
 */
export function parseDtcMessages(messages: readonly number[][], mode: number, isCan: boolean): string[] {
  const codes = new Set<string>();
  for (const message of messages) {
    if (message[0] !== mode + 0x40) continue;
    const count = isCan ? (message[1] ?? 0) : Number.POSITIVE_INFINITY;
    const pairs = message.slice(isCan ? 2 : 1);
    for (let i = 0; i + 1 < pairs.length && i / 2 < count; i += 2) {
      const a = pairs[i]!;
      const b = pairs[i + 1]!;
      if (a || b) codes.add(decodeDtc(a, b));
    }
  }
  return [...codes];
}

/** Brakes, steering and chassis, airbags, overheating and oil pressure. */
const SAFETY_CRITICAL: readonly RegExp[] = [
  /^C/, // chassis: brakes, ABS, steering, suspension
  /^B00/, // restraint system (airbags, belt pretensioners)
  /^P021[789]$/, // engine / transmission over temperature, engine over speed
  /^P011[5-9]$/, // coolant temperature signal lost: overheating would go unnoticed
  /^P052[0-4]$/, // oil pressure
  /^P06D[A-E]$/, // oil pressure control
  /^P057[1-3]$|^P0504$|^P2299$/, // brake switch and pedal
  /^U01(?:21|31|51)$/, // lost communication with ABS, power steering, restraint module
];

export const isSafetyCritical = (code: string): boolean => SAFETY_CRITICAL.some((p) => p.test(code));

/** SAE J2012 ranges reserved for vehicle manufacturers. */
export const isManufacturerSpecific = (code: string): boolean => /^(?:P1|P3[0-3]|[BCU][12])/.test(code);

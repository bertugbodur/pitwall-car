/** Deterministic simulated cars: the whole state is a function of elapsed seconds. */

export type ScenarioId = 'city' | 'highway' | 'coldStart' | 'misfire' | 'catalyst' | 'overheat' | 'lowVoltage';

export interface VehicleState {
  /** Physical values keyed by Mode 01 PID. */
  values: Record<string, number>;
  /** Voltage at the diagnostic port. */
  voltage: number;
  vin: string;
  stored: string[];
  pending: string[];
  permanent: string[];
  freezeFrame?: { dtc: string; values: Record<string, number> };
}

export interface Scenario {
  id: ScenarioId;
  name: { en: string; tr: string };
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'city', name: { en: 'City driving', tr: 'Şehir içi sürüş' } },
  { id: 'highway', name: { en: 'Highway', tr: 'Otoyol' } },
  { id: 'coldStart', name: { en: 'Cold start', tr: 'Soğuk çalıştırma' } },
  { id: 'misfire', name: { en: 'Cylinder 1 misfire', tr: '1. silindir ateşleme arızası' } },
  { id: 'catalyst', name: { en: 'Weak catalytic converter', tr: 'Katalitik konvertör verimi düşük' } },
  { id: 'overheat', name: { en: 'Overheating', tr: 'Aşırı ısınma' } },
  { id: 'lowVoltage', name: { en: 'Low battery voltage', tr: 'Düşük akü voltajı' } },
];

/** Not a real car. VINs never contain I, O or Q. */
const SIMULATED_VIN = 'NM0PW000000000001';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wave = (t: number, period: number, amplitude: number) => Math.sin((t / period) * 2 * Math.PI) * amplitude;

/** One minute city loop: pull away, cruise, brake, wait at the lights. */
function citySpeed(t: number): number {
  const phase = t % 60;
  if (phase < 15) return (phase / 15) * 52;
  if (phase < 35) return 52 + wave(t, 11, 4);
  if (phase < 45) return ((45 - phase) / 10) * 52;
  return 0;
}

function rpmFor(speed: number): number {
  if (speed < 2) return 820;
  const gear = speed < 18 ? 1 : speed < 33 ? 2 : speed < 50 ? 3 : speed < 70 ? 4 : speed < 95 ? 5 : 6;
  const perKmh = [125, 75, 52, 40, 30, 23.5][gear - 1]!;
  return clamp(speed * perKmh, 950, 4200);
}

interface Drive {
  speed: number;
  rpm: number;
  load: number;
  coolant: number;
}

function drive(speed: number, accelerating: number, t: number, coolant = 90): Drive {
  const rpm = rpmFor(speed) + wave(t, 3.1, 25);
  const load = clamp(18 + speed * 0.22 + accelerating * 12 + wave(t, 7, 3), 12, 92);
  return { speed, rpm, load, coolant: coolant + wave(t, 40, 1.5) };
}

function values({ speed, rpm, load, coolant }: Drive, t: number): Record<string, number> {
  const throttle = clamp(load * 0.55 + 4, 8, 90);
  const maf = clamp((rpm / 1000) * (load / 100) * 22, 1.8, 180);
  const upstreamO2 = 0.45 + wave(t, 1.7, 0.35);
  const fuelRate = (maf * 3600) / (14.7 * 745);
  return {
    '04': load,
    '05': coolant,
    '06': wave(t, 5, 2.3),
    '07': 1.6,
    '0B': clamp(28 + load * 0.75, 20, 100),
    '0C': rpm,
    '0D': speed,
    '0E': clamp(8 + rpm / 400, -10, 40),
    '0F': 27 + wave(t, 90, 3),
    '10': maf,
    '11': throttle,
    '14': upstreamO2,
    '15': 0.68 + wave(t, 13, 0.04),
    '1F': t,
    '21': 0,
    '2F': clamp(63 - t / 600, 0, 100),
    '31': 4213 + t / 120,
    '33': 100,
    '42': 14.1 + wave(t, 17, 0.1),
    '43': load * 0.9,
    '45': clamp(throttle - 6, 0, 100),
    '46': 21,
    '49': clamp(throttle * 0.8, 0, 100),
    '4C': throttle,
    '5C': clamp(coolant + 4, -40, 150),
    '5E': fuelRate,
  };
}

function healthy(d: Drive, t: number): VehicleState {
  const v = values(d, t);
  return { values: v, voltage: Math.round((v['42']! - 0.1) * 10) / 10, vin: SIMULATED_VIN, stored: [], pending: [], permanent: [] };
}

const city = (t: number) => healthy(drive(citySpeed(t), t % 60 < 15 ? 1.6 : 0, t), t);
const highway = (t: number) => healthy(drive(112 + wave(t, 45, 8), 0.8, t), t);

function withFault(state: VehicleState, dtc: string, extra: Partial<VehicleState> = {}): VehicleState {
  const frameValues = { ...state.values, '05': 88, '0C': 2150, '0D': 47, '04': 41, ...extra.freezeFrame?.values };
  return { ...state, stored: [dtc], ...extra, freezeFrame: { dtc, values: frameValues } };
}

export const SCENARIO_STATES: Record<ScenarioId, (t: number) => VehicleState> = {
  city,
  highway,
  coldStart(t) {
    const warmth = 1 - Math.exp(-t / 240);
    const state = healthy(drive(t < 45 ? 0 : citySpeed(t), 0, t, 12 + 78 * warmth), t);
    state.values['0C'] = Math.max(state.values['0C']!, 1350 - 550 * warmth);
    state.values['06'] = 6 * (1 - warmth);
    state.values['0F'] = 12 + 15 * warmth;
    return state;
  },
  misfire(t) {
    const state = city(t);
    state.values['0C'] = state.values['0C']! + wave(t, 0.7, 140);
    state.values['06'] = 12 + wave(t, 2, 4);
    state.values['07'] = 9.4;
    return withFault(state, 'P0301', { pending: ['P0300'] });
  },
  catalyst(t) {
    const state = highway(t);
    // A worn converter lets the downstream sensor mirror the upstream one.
    state.values['15'] = state.values['14']!;
    return withFault(state, 'P0420', { permanent: ['P0420'] });
  },
  overheat(t) {
    const coolant = clamp(96 + t * 0.2, 96, 127);
    const state = healthy(drive(95 + wave(t, 30, 6), 1, t, coolant), t);
    const frame = { dtc: 'P0217', values: { '05': 118 } };
    // The code is stored from the start so the demo does not depend on waiting.
    return withFault(state, 'P0217', { freezeFrame: frame });
  },
  lowVoltage(t) {
    const state = city(t);
    state.values['42'] = 11.5 + wave(t, 9, 0.15);
    state.voltage = Math.round((state.values['42']! - 0.1) * 10) / 10;
    return withFault(state, 'P0562');
  },
};

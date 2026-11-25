/** Mode 01 parameter definitions, formulas from SAE J1979. */

export type PollRate = 'fast' | 'medium' | 'slow';

export interface PidDef {
  /** Two hex digits. */
  pid: string;
  key: string;
  name: { en: string; tr: string };
  unit: string;
  bytes: number;
  min: number;
  max: number;
  rate: PollRate;
  decode(data: readonly number[]): number;
}

export interface PidReading {
  pid: string;
  name: string;
  value: number;
  unit: string;
  at: number;
}

type Formula = (a: number, b: number) => number;

const word: Formula = (a, b) => a * 256 + b;
const percent: Formula = (a) => (a * 100) / 255;
const temperature: Formula = (a) => a - 40;
const trim: Formula = (a) => (a * 100) / 128 - 100;
const oxygenVolts: Formula = (a) => a / 200;

function define(
  pid: string,
  key: string,
  en: string,
  tr: string,
  unit: string,
  bytes: 1 | 2,
  range: [number, number],
  rate: PollRate,
  formula: Formula,
): PidDef {
  return {
    pid,
    key,
    name: { en, tr },
    unit,
    bytes,
    min: range[0],
    max: range[1],
    rate,
    decode: (data) => formula(data[0] ?? 0, data[1] ?? 0),
  };
}

const oxygenSensors = ['14', '15', '16', '17', '18', '19', '1A', '1B'].map((pid, i) => {
  const bank = i < 4 ? 1 : 2;
  const sensor = (i % 4) + 1;
  return define(
    pid, `o2b${bank}s${sensor}`,
    `O2 sensor B${bank}S${sensor}`, `O2 sensörü B${bank}S${sensor}`,
    'V', 2, [0, 1.275], 'medium', oxygenVolts,
  );
});

export const PIDS: readonly PidDef[] = [
  define('04', 'engineLoad', 'Engine load', 'Motor yükü', '%', 1, [0, 100], 'fast', percent),
  define('05', 'coolantTemp', 'Coolant temperature', 'Motor suyu sıcaklığı', '°C', 1, [-40, 215], 'medium', temperature),
  define('06', 'stft1', 'Short term fuel trim B1', 'Kısa süreli yakıt trimi B1', '%', 1, [-100, 99.2], 'medium', trim),
  define('07', 'ltft1', 'Long term fuel trim B1', 'Uzun süreli yakıt trimi B1', '%', 1, [-100, 99.2], 'slow', trim),
  define('08', 'stft2', 'Short term fuel trim B2', 'Kısa süreli yakıt trimi B2', '%', 1, [-100, 99.2], 'medium', trim),
  define('09', 'ltft2', 'Long term fuel trim B2', 'Uzun süreli yakıt trimi B2', '%', 1, [-100, 99.2], 'slow', trim),
  define('0A', 'fuelPressure', 'Fuel pressure', 'Yakıt basıncı', 'kPa', 1, [0, 765], 'medium', (a) => a * 3),
  define('0B', 'map', 'Intake manifold pressure', 'Emme manifoldu basıncı', 'kPa', 1, [0, 255], 'fast', (a) => a),
  define('0C', 'rpm', 'Engine speed', 'Motor devri', 'rpm', 2, [0, 16383.75], 'fast', (a, b) => word(a, b) / 4),
  define('0D', 'speed', 'Vehicle speed', 'Araç hızı', 'km/h', 1, [0, 255], 'fast', (a) => a),
  define('0E', 'timingAdvance', 'Timing advance', 'Ateşleme avansı', '°', 1, [-64, 63.5], 'medium', (a) => a / 2 - 64),
  define('0F', 'intakeTemp', 'Intake air temperature', 'Emme havası sıcaklığı', '°C', 1, [-40, 215], 'slow', temperature),
  define('10', 'maf', 'Mass air flow', 'Hava kütle debisi (MAF)', 'g/s', 2, [0, 655.35], 'fast', (a, b) => word(a, b) / 100),
  define('11', 'throttle', 'Throttle position', 'Gaz kelebeği', '%', 1, [0, 100], 'fast', percent),
  ...oxygenSensors,
  define('1F', 'runTime', 'Run time since start', 'Çalışma süresi', 's', 2, [0, 65535], 'slow', word),
  define('21', 'distanceWithMil', 'Distance with MIL on', 'Arıza lambası yanarken mesafe', 'km', 2, [0, 65535], 'slow', word),
  define('2F', 'fuelLevel', 'Fuel level', 'Yakıt seviyesi', '%', 1, [0, 100], 'slow', percent),
  define('31', 'distanceSinceClear', 'Distance since codes cleared', 'Kodlar silindiğinden beri mesafe', 'km', 2, [0, 65535], 'slow', word),
  define('33', 'barometricPressure', 'Barometric pressure', 'Atmosfer basıncı', 'kPa', 1, [0, 255], 'slow', (a) => a),
  define('42', 'moduleVoltage', 'Control module voltage', 'Beyin besleme voltajı', 'V', 2, [0, 65.535], 'medium', (a, b) => word(a, b) / 1000),
  define('43', 'absoluteLoad', 'Absolute load', 'Mutlak motor yükü', '%', 2, [0, 25700], 'medium', (a, b) => (word(a, b) * 100) / 255),
  define('45', 'relativeThrottle', 'Relative throttle position', 'Bağıl gaz kelebeği', '%', 1, [0, 100], 'medium', percent),
  define('46', 'ambientTemp', 'Ambient air temperature', 'Dış hava sıcaklığı', '°C', 1, [-40, 215], 'slow', temperature),
  define('49', 'acceleratorPedal', 'Accelerator pedal position', 'Gaz pedalı konumu', '%', 1, [0, 100], 'medium', percent),
  define('4C', 'commandedThrottle', 'Commanded throttle', 'İstenen gaz kelebeği', '%', 1, [0, 100], 'medium', percent),
  define('5C', 'oilTemp', 'Engine oil temperature', 'Motor yağı sıcaklığı', '°C', 1, [-40, 215], 'slow', temperature),
  define('5E', 'fuelRate', 'Engine fuel rate', 'Yakıt tüketim debisi', 'L/h', 2, [0, 3276.75], 'fast', (a, b) => word(a, b) / 20),
];

const BY_PID = new Map(PIDS.map((def) => [def.pid, def]));

export const getPid = (pid: string): PidDef | undefined => BY_PID.get(pid);

export function decodePid(pid: string, data: readonly number[]): number | undefined {
  const def = BY_PID.get(pid);
  if (!def || data.length < def.bytes) return undefined;
  return def.decode(data);
}

export const hex2 = (value: number): string => value.toString(16).toUpperCase().padStart(2, '0');

/** Reads the 4 byte answer of 0100, 0120, ... into the list of supported PIDs. */
export function parseSupportedPids(base: number, data: readonly number[]): string[] {
  const supported: string[] = [];
  for (let bit = 0; bit < 32; bit++) {
    if ((data[bit >> 3] ?? 0) & (0x80 >> (bit % 8))) supported.push(hex2(base + bit + 1));
  }
  return supported;
}

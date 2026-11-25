export type Level = 'ok' | 'warn' | 'danger';

export interface Alert {
  id: 'overheat' | 'lowVoltage' | 'newCode' | 'lowFuel';
  level: Exclude<Level, 'ok'>;
  detail: string;
}

export interface AlertInput {
  coolant?: number;
  voltage?: number;
  rpm?: number;
  fuelLevel?: number;
  /** Codes that appeared since the driver last acknowledged them. */
  newCodes: readonly { code: string; safetyCritical: boolean }[];
}

export const OVERHEAT_C = 110;
const LOW_VOLTAGE_RUNNING = 12.5;
const LOW_VOLTAGE_OFF = 11.8;
const LOW_FUEL_PERCENT = 12;

/** Active warnings, most urgent first. */
export function activeAlerts({ coolant, voltage, rpm, fuelLevel, newCodes }: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  if (coolant !== undefined && coolant >= OVERHEAT_C) {
    alerts.push({ id: 'overheat', level: 'danger', detail: `${Math.round(coolant)} °C` });
  }
  if (newCodes.length > 0) {
    const level = newCodes.some((c) => c.safetyCritical) ? 'danger' : 'warn';
    alerts.push({ id: 'newCode', level, detail: newCodes.map((c) => c.code).join(' ') });
  }
  const running = (rpm ?? 0) > 400;
  if (voltage !== undefined && voltage < (running ? LOW_VOLTAGE_RUNNING : LOW_VOLTAGE_OFF)) {
    alerts.push({ id: 'lowVoltage', level: 'warn', detail: `${voltage.toFixed(1)} V` });
  }
  if (fuelLevel !== undefined && fuelLevel <= LOW_FUEL_PERCENT) {
    alerts.push({ id: 'lowFuel', level: 'warn', detail: `${Math.round(fuelLevel)} %` });
  }
  return alerts.sort((a, b) => Number(b.level === 'danger') - Number(a.level === 'danger'));
}

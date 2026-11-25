/** Decodes Mode 01 PID 01: malfunction lamp, code count and inspection readiness monitors. */

export type MonitorStatus = 'complete' | 'incomplete' | 'unsupported';

export interface Monitor {
  id: string;
  status: MonitorStatus;
}

export interface Readiness {
  milOn: boolean;
  dtcCount: number;
  ignition: 'spark' | 'compression';
  monitors: Monitor[];
}

const CONTINUOUS = ['misfire', 'fuelSystem', 'components'] as const;

// Index = bit number in bytes C (supported) and D (incomplete); null bits are reserved.
const SPARK = ['catalyst', 'heatedCatalyst', 'evap', 'secondaryAir', 'particulateFilter', 'oxygenSensor', 'oxygenSensorHeater', 'egrVvt'];
const COMPRESSION = ['nmhcCatalyst', 'noxScr', null, 'boostPressure', null, 'exhaustGasSensor', 'pmFilter', 'egrVvt'];

const status = (supported: number, incomplete: number): MonitorStatus =>
  !supported ? 'unsupported' : incomplete ? 'incomplete' : 'complete';

/** Combines the answers of several control units: any lamp counts, any unfinished monitor counts. */
export function mergeReadiness(answers: readonly Readiness[]): Readiness | undefined {
  if (answers.length === 0) return undefined;
  const supported = (r: Readiness) => r.monitors.filter((m) => m.status !== 'unsupported').length;
  // The engine unit supports the most monitors; it decides the ignition type.
  const [main, ...others] = [...answers].sort((a, b) => supported(b) - supported(a)) as [Readiness, ...Readiness[]];
  const rank: Record<MonitorStatus, number> = { unsupported: 0, complete: 1, incomplete: 2 };
  const monitors = main.monitors.map((monitor) => {
    let status = monitor.status;
    for (const other of others) {
      const same = other.ignition === main.ignition || ['misfire', 'fuelSystem', 'components'].includes(monitor.id);
      const theirs = same ? other.monitors.find((m) => m.id === monitor.id)?.status : undefined;
      if (theirs && rank[theirs] > rank[status]) status = theirs;
    }
    return { id: monitor.id, status };
  });
  return {
    milOn: answers.some((r) => r.milOn),
    dtcCount: answers.reduce((sum, r) => sum + r.dtcCount, 0),
    ignition: main.ignition,
    monitors,
  };
}

export function decodeReadiness(data: readonly number[]): Readiness {
  const [a = 0, b = 0, c = 0, d = 0] = data;
  const compression = (b & 0x08) !== 0;
  const continuous = CONTINUOUS.map((id, bit) => ({ id, status: status(b & (1 << bit), b & (0x10 << bit)) }));
  const others = (compression ? COMPRESSION : SPARK).flatMap((id, bit) =>
    id ? [{ id, status: status(c & (1 << bit), d & (1 << bit)) }] : [],
  );
  return {
    milOn: (a & 0x80) !== 0,
    dtcCount: a & 0x7f,
    ignition: compression ? 'compression' : 'spark',
    monitors: [...continuous, ...others],
  };
}

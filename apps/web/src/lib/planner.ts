/**
 * Deliberately simple energy model: constant average consumption, a correction for
 * speed and elevation, and charging at 80 % of the available power instead of a curve.
 */

export interface Car {
  usableKwh: number;
  consumptionWhKm: number;
  maxDcKw?: number;
}

export interface Station {
  name: string;
  lon: number;
  lat: number;
  atKm: number;
  kw: number;
  provider?: string;
}

export interface ChargeStop extends Station {
  arrivePercent: number;
  chargeToPercent: number;
  minutes: number;
}

export type ChargePlan =
  | { ok: true; stops: ChargeStop[]; arrivePercent: number }
  | { ok: false; reachKm: number };

export interface Route {
  /** The input points, [longitude, latitude, elevation?]. */
  points: number[][];
  line: [number, number][];
  /** Kilometres from the start at each point of the line. */
  km: number[];
  distanceKm: number;
  durationSec: number;
  energyKwhAt(km: number, car: Car): number;
}

const MASS_KG = 1900;
const DRIVETRAIN_EFFICIENCY = 0.9;
const REGEN_EFFICIENCY = 0.6;
const SPEED_FREE_KMH = 90;
const EXTRA_PER_KMH = 0.008;
const CHARGE_POWER_FACTOR = 0.8;
const FAST_CHARGE_LIMIT = 80;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Points are [longitude, latitude, elevation?]. */
export function haversineKm(a: readonly number[], b: readonly number[]): number {
  const h =
    Math.sin(rad(b[1]! - a[1]!) / 2) ** 2 +
    Math.cos(rad(a[1]!)) * Math.cos(rad(b[1]!)) * Math.sin(rad(b[0]! - a[0]!) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function buildRoute(points: readonly (readonly number[])[], durationSec: number, distanceKm?: number): Route {
  const km = [0];
  const ascent = [0];
  const descent = [0];
  for (let i = 1; i < points.length; i++) {
    const climb = (points[i]![2] ?? 0) - (points[i - 1]![2] ?? 0);
    km.push(km[i - 1]! + haversineKm(points[i - 1]!, points[i]!));
    ascent.push(ascent[i - 1]! + Math.max(0, climb));
    descent.push(descent[i - 1]! + Math.max(0, -climb));
  }
  const measured = km[km.length - 1] || 1;
  const total = distanceKm ?? measured;
  // The simplified line is a little shorter than the road; scale to the reported distance.
  const scaled = km.map((v) => (v * total) / measured);
  const averageKmh = total / Math.max(durationSec / 3600, 1e-6);
  const speedFactor = 1 + Math.max(0, averageKmh - SPEED_FREE_KMH) * EXTRA_PER_KMH;
  const kwhForHeight = (metres: number) => (MASS_KG * 9.81 * metres) / 3.6e6;

  return {
    points: points.map((p) => [...p]),
    line: points.map((p) => [p[0]!, p[1]!]),
    km: scaled,
    distanceKm: total,
    durationSec,
    energyKwhAt(at, car) {
      let i = scaled.findIndex((v) => v >= at - 1e-9);
      if (i < 0) i = scaled.length - 1;
      const flat = (at * car.consumptionWhKm * speedFactor) / 1000;
      return flat + kwhForHeight(ascent[i]!) / DRIVETRAIN_EFFICIENCY - kwhForHeight(descent[i]!) * REGEN_EFFICIENCY;
    },
  };
}

export function planCharging(
  route: Route,
  car: Car,
  limits: { startPercent: number; arrivePercent: number; minPercent: number },
  stations: readonly Station[],
): ChargePlan {
  const needed = (from: number, to: number) =>
    ((route.energyKwhAt(to, car) - route.energyKwhAt(from, car)) / car.usableKwh) * 100;
  const sorted = [...stations].sort((a, b) => a.atKm - b.atKm);

  const stops: ChargeStop[] = [];
  let at = 0;
  let level = limits.startPercent;

  for (;;) {
    const atEnd = level - needed(at, route.distanceKm);
    if (atEnd >= limits.arrivePercent - 0.05) return { ok: true, stops, arrivePercent: atEnd };

    const reachable = sorted.filter((s) => s.atKm > at + 1 && level - needed(at, s.atKm) >= limits.minPercent);
    const farthest = reachable[reachable.length - 1];
    if (!farthest) {
      // How far the current charge goes before dropping to the floor.
      const within = route.km.filter((km) => km >= at && level - needed(at, km) >= limits.minPercent);
      return { ok: false, reachKm: within[within.length - 1] ?? at };
    }
    // Among the stations near the end of the range, prefer the most powerful one.
    const windowStart = at + (farthest.atKm - at) * 0.75;
    const best = reachable
      .filter((s) => s.atKm >= windowStart)
      .reduce((a, b) => (b.kw > a.kw || (b.kw === a.kw && b.atKm > a.atKm) ? b : a));

    const arrive = level - needed(at, best.atKm);
    const toFinish = limits.arrivePercent + needed(best.atKm, route.distanceKm);
    let target = Math.min(toFinish, FAST_CHARGE_LIMIT);
    // Charge past 80 % only when the next leg cannot be done otherwise.
    const canGoOn = sorted.some((s) => s.atKm > best.atKm + 1 && target - needed(best.atKm, s.atKm) >= limits.minPercent);
    if (toFinish > target && !canGoOn) target = Math.min(toFinish, 100);
    target = Math.max(target, arrive);

    const kw = Math.min(best.kw, car.maxDcKw ?? best.kw) * CHARGE_POWER_FACTOR;
    const kwh = ((target - arrive) / 100) * car.usableKwh;
    stops.push({ ...best, arrivePercent: arrive, chargeToPercent: target, minutes: (kwh / kw) * 60 });
    at = best.atKm;
    level = target;
  }
}

export function fuelCost(distanceKm: number, litresPer100Km: number, pricePerLitre: number) {
  const litres = (distanceKm * litresPer100Km) / 100;
  return { litres, cost: litres * pricePerLitre };
}

/** Google encoded polyline (precision 5) of [lon, lat] points, as Open Charge Map expects. */
export function encodePolyline(points: readonly (readonly number[])[]): string {
  let previousLat = 0;
  let previousLon = 0;
  let result = '';
  const push = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    for (; v >= 0x20; v >>= 5) result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    result += String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const y = Math.round(lat! * 1e5);
    const x = Math.round(lon! * 1e5);
    push(y - previousLat);
    push(x - previousLon);
    previousLat = y;
    previousLon = x;
  }
  return result;
}

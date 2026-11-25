import { describe, expect, test } from 'vitest';
import { activeAlerts } from '../src/lib/alerts.ts';
import { createDriveLock } from '../src/lib/driving.ts';
import { fuelRateLh, litresPer100Km } from '../src/lib/fuel.ts';
import { healthScore } from '../src/lib/health.ts';
import { TripRecorder } from '../src/lib/trip.ts';

describe('fuel consumption', () => {
  const petrol = { fuel: 'petrol' as const, displacementL: 1.6 };

  test('from mass air flow', () => {
    expect(fuelRateLh({ maf: 10 }, petrol)).toBeCloseTo((10 * 3600) / (14.7 * 745), 3);
  });

  test('speed-density fallback from MAP, intake temperature and rpm', () => {
    // 2000 rpm, 50 kPa, 27 °C, 1.6 L, VE 0.8
    const airGs = (2000 / 120) * 1.6 * 50 * 0.8 * (28.97 / (8.314 * 300.15));
    expect(fuelRateLh({ rpm: 2000, map: 50, iat: 27 }, petrol)).toBeCloseTo((airGs * 3600) / (14.7 * 745), 3);
  });

  test('diesel and LPG use their own ratio and density', () => {
    expect(fuelRateLh({ maf: 10 }, { fuel: 'diesel' })).toBeCloseTo(36000 / (14.5 * 832), 3);
    expect(fuelRateLh({ maf: 10 }, { fuel: 'lpg' })).toBeCloseTo(36000 / (15.6 * 540), 3);
  });

  test('gives nothing without enough data or for electric cars', () => {
    expect(fuelRateLh({ rpm: 2000, map: 50, iat: 27 }, { fuel: 'petrol' })).toBeUndefined();
    expect(fuelRateLh({}, petrol)).toBeUndefined();
    expect(fuelRateLh({ maf: 10 }, { fuel: 'ev' })).toBeUndefined();
  });

  test('litres per 100 km only while actually moving', () => {
    expect(litresPer100Km(6, 100)).toBeCloseTo(6);
    expect(litresPer100Km(1, 3)).toBeUndefined();
  });
});

describe('trip recorder', () => {
  const driven = (speed: number, seconds: number) => {
    const trip = new TripRecorder(0);
    for (let s = 0; s < seconds; s++) trip.add({ at: s * 1000, speed, rpm: 2000 });
    return trip;
  };

  test('integrates distance, fuel, idle time and peak temperature', () => {
    const trip = new TripRecorder(0);
    for (let s = 0; s <= 60; s++) {
      trip.add({ at: s * 1000, speed: s <= 30 ? 0 : 72, rpm: 800, coolant: 80 + s / 10, fuelLh: 3.6 });
    }
    const result = trip.finish(60_000)!;
    expect(result.distanceKm).toBeCloseTo(0.6, 1);
    expect(result.fuelL).toBeCloseTo(0.06, 3);
    expect(result.idleSec).toBeGreaterThanOrEqual(29);
    expect(result.idleSec).toBeLessThanOrEqual(31);
    expect(result.maxCoolantC).toBeCloseTo(86);
    expect(result.avgConsumption).toBeCloseTo((result.fuelL! / result.distanceKm) * 100);
  });

  test('does not invent distance across a connection gap', () => {
    const trip = new TripRecorder(0);
    trip.add({ at: 0, speed: 100, rpm: 2000 });
    trip.add({ at: 600_000, speed: 100, rpm: 2000 });
    for (let s = 1; s <= 10; s++) trip.add({ at: 600_000 + s * 1000, speed: 100, rpm: 2000 });
    expect(trip.finish(610_000)!.distanceKm).toBeCloseTo(1000 / 3600, 4);
  });

  test('discards a recording where the car never really drove', () => {
    expect(driven(0, 20).finish(20_000)).toBeUndefined();
  });

  test('keeps no positions unless they are given', () => {
    expect(driven(60, 60).finish(60_000)!.track).toBeUndefined();
    const tracked = driven(60, 60);
    tracked.addPosition(29, 41);
    expect(tracked.finish(60_000)!.track).toEqual([[29, 41]]);
  });
});

describe('drive lock', () => {
  test('locks above 5 km/h and releases only after the car has stayed slow', () => {
    const lock = createDriveLock(2000);
    expect(lock.update(5, 0)).toBe(false);
    expect(lock.update(6, 100)).toBe(true);
    expect(lock.update(0, 200)).toBe(true);
    expect(lock.update(0, 1500)).toBe(true);
    expect(lock.update(0, 2300)).toBe(false);
  });

  test('rolling again restarts the release timer', () => {
    const lock = createDriveLock(2000);
    lock.update(30, 0);
    lock.update(0, 100);
    lock.update(20, 1900);
    expect(lock.update(0, 2000)).toBe(true);
    expect(lock.update(0, 4100)).toBe(false);
  });

  test('unknown speed (disconnected) never locks', () => {
    const lock = createDriveLock(2000);
    lock.update(50, 0);
    expect(lock.update(undefined, 100)).toBe(false);
  });
});

describe('warning layer', () => {
  const base = { coolant: 90, voltage: 14.1, rpm: 1500, fuelLevel: 50, newCodes: [] };
  const ids = (input: Parameters<typeof activeAlerts>[0]) => activeAlerts(input).map((a) => `${a.id}:${a.level}`);

  test('says nothing on a healthy car', () => {
    expect(ids(base)).toEqual([]);
  });

  test('overheating and low voltage', () => {
    expect(ids({ ...base, coolant: 112 })).toEqual(['overheat:danger']);
    expect(ids({ ...base, voltage: 11.6 })).toEqual(['lowVoltage:warn']);
    // engine off: a resting battery around 12.3 V is normal
    expect(ids({ ...base, rpm: 0, voltage: 12.3 })).toEqual([]);
  });

  test('new codes and low fuel, most urgent first', () => {
    const newCodes = (code: string, safetyCritical: boolean) => ({ ...base, fuelLevel: 8, newCodes: [{ code, safetyCritical }] });
    expect(ids(newCodes('P0420', false))).toEqual(['newCode:warn', 'lowFuel:warn']);
    expect(ids(newCodes('P0217', true))).toEqual(['newCode:danger', 'lowFuel:warn']);
  });
});

describe('vehicle health score', () => {
  const dtc = (kind: 'stored' | 'pending' | 'permanent', safetyCritical = false) => ({ code: 'P0000', kind, safetyCritical });

  test('is 100 with nothing wrong and unknown before a scan', () => {
    expect(healthScore({ dtcs: [], milOn: false })).toEqual({ score: 100, level: 'ok' });
    expect(healthScore({ dtcs: undefined })).toBeUndefined();
  });

  test('drops with faults and turns red for safety critical ones or overheating', () => {
    expect(healthScore({ dtcs: [dtc('pending')], milOn: false })?.level).toBe('ok');
    expect(healthScore({ dtcs: [dtc('stored')], milOn: true })).toEqual({ score: 70, level: 'warn' });
    expect(healthScore({ dtcs: [dtc('stored', true)], milOn: true })?.level).toBe('danger');
    expect(healthScore({ dtcs: [], coolant: 118 })?.level).toBe('danger');
  });
});

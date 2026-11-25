import { describe, expect, test, vi } from 'vitest';
import { buildRoute, encodePolyline, fuelCost, planCharging, type Route, type Station } from '../src/lib/planner.ts';
import { fetchRoute, fetchStations, geocode, HOSTED_ORS } from '../src/lib/services.ts';

/** A straight route heading east, driven at 90 km/h. */
function flatRoute(km: number, ascentPerKm = 0): Route {
  const degPerKm = 1 / (111.2 * Math.cos((40 * Math.PI) / 180));
  const points = Array.from({ length: km + 1 }, (_, i) => [29 + i * degPerKm, 40, i * ascentPerKm]);
  return buildRoute(points, (km / 90) * 3600, km);
}

const car = { usableKwh: 60, consumptionWhKm: 180, maxDcKw: 150 };
const limits = { startPercent: 90, arrivePercent: 20, minPercent: 10 };
const station = (atKm: number, kw = 120): Station => ({ name: `S${atKm}`, atKm, kw, lon: 29, lat: 40 });

describe('route', () => {
  test('measures distance along the line and energy for the speed', () => {
    const route = flatRoute(100);
    expect(route.km[route.km.length - 1]).toBeCloseTo(100, 0);
    expect(route.energyKwhAt(100, car)).toBeCloseTo(18, 0);
  });

  test('climbing costs energy', () => {
    const climbing = flatRoute(100, 5).energyKwhAt(100, car);
    expect(climbing).toBeGreaterThan(flatRoute(100).energyKwhAt(100, car) + 2);
  });

  test('encodes polylines the Google way', () => {
    const points = [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });
});

describe('charging plan', () => {
  test('needs no stop for a short trip', () => {
    const plan = planCharging(flatRoute(150), car, limits, []);
    expect(plan).toMatchObject({ ok: true, stops: [] });
    if (plan.ok) expect(plan.arrivePercent).toBeCloseTo(90 - (27 / 60) * 100, 0);
  });

  test('stops far along, prefers the faster charger and charges only as much as needed', () => {
    const plan = planCharging(flatRoute(410), car, limits, [station(100), station(220), station(240, 50)]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.stops.map((s) => s.name)).toEqual(['S220']);
    const stop = plan.stops[0]!;
    expect(stop.arrivePercent).toBeGreaterThanOrEqual(10);
    expect(plan.arrivePercent).toBeGreaterThanOrEqual(19.9);
    expect(plan.arrivePercent).toBeLessThan(21);
    // 80 % of the slower of charger and car
    const kwh = ((stop.chargeToPercent - stop.arrivePercent) / 100) * 60;
    expect(stop.minutes).toBeCloseTo((kwh / (120 * 0.8)) * 60, 0);
  });

  test('does not fast charge past 80 % when a later charger covers the rest', () => {
    const plan = planCharging(flatRoute(450), car, limits, [station(220), station(420)]);
    expect(plan.ok && plan.stops.map((s) => [s.name, Math.round(s.chargeToPercent)])).toEqual([['S220', 80], ['S420', 29]]);
  });

  test('uses several stops on a long trip, none below the floor', () => {
    const stations = Array.from({ length: 17 }, (_, i) => station(50 * (i + 1)));
    const plan = planCharging(flatRoute(900), car, limits, stations);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.stops.length).toBeGreaterThanOrEqual(3);
    for (const stop of plan.stops) expect(stop.arrivePercent).toBeGreaterThanOrEqual(9.9);
  });

  test('says how far it gets when no charger is within reach', () => {
    const plan = planCharging(flatRoute(450), car, limits, [station(400)]);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reachKm).toBeLessThan(300);
  });
});

test('fuel cost from measured consumption and the user price', () => {
  const { litres, cost } = fuelCost(450, 6.4, 45);
  expect(litres).toBeCloseTo(28.8);
  expect(cost).toBeCloseTo(1296);
});

const reply = (body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body)));
const hosted = { engine: 'ors' as const, url: HOSTED_ORS, key: 'k1' };

describe('services', () => {
  test('OpenRouteService: posts coordinates with the key in a header', async () => {
    const fetch = reply({
      features: [
        {
          properties: { summary: { distance: 1000, duration: 60 } },
          geometry: { coordinates: [[29, 41, 10], [29.01, 41, 12]] },
        },
      ],
    });
    const route = await fetchRoute([[29, 41], [32.8, 39.9]], hosted, fetch);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson');
    expect(init!.headers).toMatchObject({ authorization: 'k1' });
    expect(JSON.parse(String(init!.body))).toEqual({ coordinates: [[29, 41], [32.8, 39.9]], elevation: true });
    expect(route.durationSec).toBe(60);
  });

  test('a self-hosted server never receives the hosted service key', async () => {
    const fetch = reply({ routes: [{ distance: 1000, duration: 60, geometry: { coordinates: [[29, 41], [29.01, 41]] } }] });
    await fetchRoute([[29, 41], [29.01, 41]], { engine: 'osrm', url: 'http://localhost:5000', key: 'k1' }, fetch);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toContain('http://localhost:5000/route/v1/driving/29,41;29.01,41');
    expect(JSON.stringify(init ?? {})).not.toContain('k1');
  });

  test('geocodes through Pelias and takes typed coordinates without any request', async () => {
    const fetch = reply({ features: [{ geometry: { coordinates: [32.85, 39.93] }, properties: { label: 'Ankara' } }] });
    expect(await geocode('Ankara', hosted, fetch)).toEqual({ name: 'Ankara', point: [32.85, 39.93] });
    expect(fetch.mock.calls[0]![0]).toContain('https://api.heigit.org/pelias/v1/search?text=Ankara');
    fetch.mockClear();
    expect(await geocode('41.01, 28.98', hosted, fetch)).toEqual({ name: '41.01, 28.98', point: [28.98, 41.01] });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('Open Charge Map: key in a header, fast chargers only, data licence kept', async () => {
    const poi = (kw: number) => ({
      AddressInfo: { Title: `Istasyon ${kw}`, Latitude: 40, Longitude: 29.5 },
      Connections: [{ PowerKW: 22 }, { PowerKW: kw }],
      DataProvider: { Title: 'Open Charge Map', License: 'CC BY 4.0' },
    });
    const fetch = reply([poi(120), poi(11)]);
    const stations = await fetchStations(flatRoute(100), 'ocm-key', fetch);
    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(url).origin).toBe('https://api.openchargemap.io');
    expect(url).not.toContain('ocm-key');
    expect(init!.headers).toMatchObject({ 'x-api-key': 'ocm-key' });
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({ name: 'Istasyon 120', kw: 120, provider: 'Open Charge Map (CC BY 4.0)' });
    expect(stations[0]!.atKm).toBeGreaterThan(30);
  });

  test('turns an error answer into a readable message', async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"message":"Daily quota reached"}}', { status: 429 }));
    await expect(fetchRoute([[1, 1], [2, 2]], hosted, fetch)).rejects.toThrow(/429.*quota/);
  });
});

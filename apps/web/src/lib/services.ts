/** Routing, geocoding and charging station requests, each with the user's own key. */
import { buildRoute, encodePolyline, haversineKm, type Route, type Station } from './planner.ts';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface RoutingOptions {
  engine: 'ors' | 'osrm';
  url: string;
  key: string;
}

export const HOSTED_ORS = 'https://api.heigit.org/openrouteservice';
const OCM = 'https://api.openchargemap.io/v3/poi';
const MIN_FAST_KW = 40;
const defaultFetch: Fetch = (url, init) => fetch(url, init);

/** The key belongs to the hosted service and is never sent anywhere else. */
const isHosted = (url: string) => new URL(url).origin === new URL(HOSTED_ORS).origin;
const auth = ({ url, key }: RoutingOptions): Record<string, string> =>
  isHosted(url) && key ? { authorization: key.trim() } : {};
const trim = (url: string) => url.replace(/\/+$/, '');

async function json(response: Response): Promise<any> {
  const body: any = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`${response.status}: ${body?.error?.message ?? body?.error ?? body?.message ?? response.statusText}`);
  }
  return body;
}

export async function geocode(
  text: string,
  options: RoutingOptions,
  fetch: Fetch = defaultFetch,
): Promise<{ name: string; point: [number, number] }> {
  const typed = /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (typed) return { name: text.trim(), point: [Number(typed[2]), Number(typed[1])] };
  if (options.engine !== 'ors' || !isHosted(options.url)) {
    throw new Error('Address search needs OpenRouteService; type coordinates as "latitude, longitude" instead.');
  }
  const base = trim(options.url).replace(/\/openrouteservice$/, '');
  const body = await json(
    await fetch(`${base}/pelias/v1/search?text=${encodeURIComponent(text)}&size=1`, { headers: auth(options) }),
  );
  const feature = body.features?.[0];
  if (!feature) throw new Error(`Not found: ${text}`);
  return { name: feature.properties.label, point: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]] };
}

export async function fetchRoute(
  points: [number, number][],
  options: RoutingOptions,
  fetch: Fetch = defaultFetch,
): Promise<Route> {
  if (options.engine === 'osrm') {
    const path = points.map((p) => p.join(',')).join(';');
    const body = await json(await fetch(`${trim(options.url)}/route/v1/driving/${path}?overview=full&geometries=geojson`));
    const route = body.routes?.[0];
    if (!route) throw new Error('No route found');
    return buildRoute(route.geometry.coordinates, route.duration, route.distance / 1000);
  }
  const body = await json(
    await fetch(`${trim(options.url)}/v2/directions/driving-car/geojson`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(options) },
      body: JSON.stringify({ coordinates: points, elevation: true }),
    }),
  );
  const feature = body.features?.[0];
  if (!feature) throw new Error('No route found');
  const { distance, duration } = feature.properties.summary;
  return buildRoute(feature.geometry.coordinates, duration, distance / 1000);
}

/** Fast chargers within a few kilometres of the route. */
export async function fetchStations(route: Route, key: string, fetch: Fetch = defaultFetch): Promise<Station[]> {
  const step = Math.max(1, Math.floor(route.line.length / 100));
  const sampled = route.line.filter((_, i) => i % step === 0 || i === route.line.length - 1);
  const query = new URLSearchParams({
    polyline: encodePolyline(sampled),
    distance: '4',
    distanceunit: 'km',
    maxresults: '400',
    verbose: 'false',
    minpowerkw: String(MIN_FAST_KW),
  });
  const pois: any[] = await json(await fetch(`${OCM}?${query}`, { headers: { 'x-api-key': key.trim() } }));

  return pois.flatMap((poi) => {
    const kw = Math.max(0, ...(poi.Connections ?? []).map((c: any) => c.PowerKW ?? 0));
    const { Title: name, Latitude: lat, Longitude: lon } = poi.AddressInfo ?? {};
    if (kw < MIN_FAST_KW || lat === undefined || lon === undefined) return [];
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    route.line.forEach((point, i) => {
      const distance = haversineKm(point, [lon, lat]);
      if (distance < best) [best, nearest] = [distance, i];
    });
    const source = poi.DataProvider;
    const provider = source ? `${source.Title}${source.License ? ` (${source.License})` : ''}` : undefined;
    return [{ name, lat, lon, kw, atKm: route.km[nearest]!, provider }];
  });
}

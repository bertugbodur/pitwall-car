/** Owns the single connection to the car and feeds the stores. */
import { createLivePoller, ElmClient, type Dtc, type LivePoller, type PidReading, type Transport } from '@pitwall/obd-core';
import {
  createBleTransport,
  createBridgeTransport,
  createSerialTransport,
  createSimulatorTransport,
  type SimulatorControls,
} from '@pitwall/transports';
import type { ScenarioId } from '@pitwall/obd-core/emulator';
import { listTrips, saveTrip } from './db.ts';
import { createDriveLock } from './driving.ts';
import { staleKeys } from './freshness.ts';
import { fuelRateLh } from './fuel.ts';
import { addReading, stopRecording } from './recorder.ts';
import { useSettings } from './settings.ts';
import { INITIAL, recordValue, useLive, type Source } from './store.ts';
import { TripRecorder } from './trip.ts';

const RESCAN_MS = 20_000;
/** A trip ends after the engine has been off, or the link gone, this long. */
const TRIP_END_SEC = 90;
/** If the link drops while moving, the screen stays locked this long. */
const LOST_LINK_LOCK_MS = 30_000;

let client: ElmClient | undefined;
let poller: LivePoller | undefined;
let simulator: SimulatorControls | undefined;
let bridgeShare: ((trips: unknown[]) => void) | undefined;
let timers: ReturnType<typeof setInterval>[] = [];
let unlockTimer: ReturnType<typeof setTimeout> | undefined;
let trip: TripRecorder | undefined;
let engineOffSec = 0;
let watchId: number | undefined;
let acknowledged: Set<string> | undefined;
/** Counts connection attempts; an attempt that is no longer the latest gives up. */
let generation = 0;
const stamps: Record<string, number> = {};
const lock = createDriveLock();

function transportFor(source: Source): { transport: Transport; sim?: SimulatorControls; share?: (trips: unknown[]) => void } {
  const settings = useSettings.getState();
  if (source === 'serial') return { transport: createSerialTransport(settings.baudRate) };
  if (source === 'ble') return { transport: createBleTransport() };
  if (source === 'bridge') {
    const bridge = createBridgeTransport({ code: settings.bridgeCode.trim(), port: settings.bridgePort });
    return { transport: bridge.transport, share: bridge.shareTrips };
  }
  const sim = createSimulatorTransport(settings.scenario);
  sim.controls.setParked(true);
  return { transport: sim.transport, sim: sim.controls };
}

function handle(reading: PidReading): void {
  stamps[reading.pid] = reading.at;
  recordValue(reading.pid, reading.value, reading.at);
  if (reading.pid === '0D') useLive.setState({ driving: lock.update(reading.value, reading.at) });
  addReading(reading);
}

/** Drops values the car has stopped answering, so they are not mistaken for current ones. */
function expire(now: number): void {
  const stale = staleKeys(stamps, now);
  if (stale.length === 0) return;
  const values = { ...useLive.getState().values };
  for (const key of stale) {
    delete values[key];
    delete stamps[key];
  }
  useLive.setState({ values });
}

/** Once a second: consumption, running averages and the trip log. */
function tick(): void {
  const now = Date.now();
  if (useLive.getState().status !== 'connected') {
    if (trip && ++engineOffSec >= TRIP_END_SEC) void endTrip();
    return;
  }
  expire(now);
  const { values, usedL, drivenKm, odometerKm } = useLive.getState();
  const speed = values['0D'] ?? 0;
  const rpm = values['0C'] ?? 0;
  const running = rpm > 0 || speed > 0;
  const profile = useSettings.getState().profile;
  const fuelLh =
    rpm > 0 ? fuelRateLh({ maf: values['10'], rpm, map: values['0B'], iat: values['0F'] }, profile) : undefined;

  useLive.setState({
    fuelLh,
    usedL: usedL + (fuelLh ?? 0) / 3600,
    // Only distance with a fuel estimate counts towards the consumption average.
    drivenKm: drivenKm + (fuelLh === undefined ? 0 : speed / 3600),
    odometerKm: odometerKm + speed / 3600,
    // Re-evaluated here too so the lock releases even if no new speed arrives.
    driving: lock.update(values['0D'], now),
  });

  if (running && !trip) startTrip();
  trip?.add({ at: now, speed, rpm, coolant: values['05'], fuelLh });
  engineOffSec = running ? 0 : engineOffSec + 1;
  if (trip && engineOffSec >= TRIP_END_SEC) void endTrip();
}

function stopTracking(): void {
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
  watchId = undefined;
}

// Switching location recording off applies at once, including to the trip under way.
useSettings.subscribe((settings, previous) => {
  if (previous.recordLocation && !settings.recordLocation) {
    stopTracking();
    trip?.clearTrack();
  }
});

function startTrip(): void {
  trip = new TripRecorder(Date.now());
  engineOffSec = 0;
  if (!useSettings.getState().recordLocation || !('geolocation' in navigator)) return;
  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => trip?.addPosition(coords.longitude, coords.latitude),
    () => {},
    { enableHighAccuracy: true, maximumAge: 5000 },
  );
}

async function endTrip(): Promise<void> {
  if (!trip) return;
  stopTracking();
  const finished = trip.finish(Date.now());
  trip = undefined;
  if (finished) await saveTrip(finished);
  await shareTrips();
}

/** Gives the local bridge trip summaries for MCP clients. Positions are left out. */
async function shareTrips(): Promise<void> {
  const share = bridgeShare;
  if (!share) return;
  const trips = await listTrips();
  share(trips.slice(0, 50).map(({ track: _track, ...summary }) => summary));
}

/** Reads codes, readiness and freeze frame. */
export async function scan(): Promise<void> {
  const current = client;
  const attempt = generation;
  if (!current || useLive.getState().scanning) return;
  useLive.setState({ scanning: true });
  try {
    const dtcs = await current.readDtcs();
    const readiness = await current.readReadiness();
    const freezeFrame = await current.readFreezeFrame();
    if (attempt !== generation) return;
    // Codes already there when connecting are not "new", unless they are safety critical.
    acknowledged ??= new Set(dtcs.filter((d) => !d.safetyCritical).map((d) => d.code));
    useLive.setState({ dtcs, readiness, freezeFrame, newCodes: unseen(dtcs) });
  } catch {
    // The poller notices a broken link and reconnects; the next scan retries.
  } finally {
    if (attempt === generation) useLive.setState({ scanning: false });
  }
}

const unseen = (dtcs: Dtc[]) => [...new Map(dtcs.filter((d) => !acknowledged?.has(d.code)).map((d) => [d.code, d])).values()];

export function acknowledgeCodes(): void {
  for (const dtc of useLive.getState().newCodes) acknowledged?.add(dtc.code);
  useLive.setState({ newCodes: [] });
}

function onLinkStatus(status: 'connected' | 'reconnecting' | 'lost', error?: string): void {
  clearTimeout(unlockTimer);
  if (status === 'lost') {
    const source = useLive.getState().source;
    void disconnect().then(() => useLive.setState({ status: 'error', source, error: error ?? 'Link lost' }));
    return;
  }
  useLive.setState({ status });
  if (status !== 'reconnecting') return;
  unlockTimer = setTimeout(() => {
    lock.update(undefined, Date.now());
    useLive.setState({ driving: false });
  }, LOST_LINK_LOCK_MS);
}

export async function connect(source: Source): Promise<void> {
  if (useLive.getState().status === 'connecting') return;
  useLive.setState({ status: 'connecting' });
  await disconnect();
  const attempt = ++generation;
  useLive.setState({ ...INITIAL, status: 'connecting', source });
  let next: ElmClient | undefined;
  try {
    const link = transportFor(source);
    next = new ElmClient(link.transport);
    const info = await next.connect();
    const vin = await next.readVin().catch(() => undefined);
    if (attempt !== generation) return void (await next.close().catch(() => {}));
    client = next;
    simulator = link.sim;
    bridgeShare = link.share;
    useLive.setState({ status: 'connected', info, vin });
    let lastError: string | undefined;
    poller = createLivePoller(next, {
      onReading: handle,
      onError: (error) => (lastError = error instanceof Error ? error.message : String(error)),
      onStatus: (status) => attempt === generation && onLinkStatus(status, lastError),
    });
    poller.start();
    timers = [setInterval(tick, 1000), setInterval(() => void scan(), RESCAN_MS)];
    await shareTrips();
    await scan();
  } catch (error) {
    // The adapter must be released, or the next attempt finds it still open.
    await next?.close().catch(() => {});
    if (attempt !== generation) return;
    await disconnect();
    useLive.setState({ status: 'error', source, error: error instanceof Error ? error.message : String(error) });
  }
}

export async function disconnect(): Promise<void> {
  generation++;
  clearTimeout(unlockTimer);
  timers.forEach(clearInterval);
  timers = [];
  const [oldPoller, oldClient] = [poller, client];
  poller = undefined;
  client = undefined;
  await endTrip();
  bridgeShare = undefined;
  await oldPoller?.stop();
  await oldClient?.close().catch(() => {});
  simulator = undefined;
  acknowledged = undefined;
  for (const key of Object.keys(stamps)) delete stamps[key];
  stopRecording();
  lock.update(undefined, Date.now());
  useLive.setState(INITIAL);
}

export function setParked(parked: boolean): void {
  simulator?.setParked(parked);
  useLive.setState({ parked });
}

export function setScenario(scenario: ScenarioId): void {
  useSettings.getState().set({ scenario });
  simulator?.setScenario(scenario);
  setTimeout(() => void scan(), 200);
}

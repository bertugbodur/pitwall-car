import { afterEach, describe, expect, test } from 'vitest';
import { ForbiddenCommandError } from '../src/allowlist.ts';
import { ElmClient, ElmTimeoutError } from '../src/client.ts';
import { createEmulator, SCENARIOS, type EmulatorOptions } from '../src/emulator/index.ts';
import { PIDS } from '../src/pids.ts';
import { createLivePoller, PollScheduler } from '../src/poller.ts';
import { guardTransport, type RawChannel } from '../src/transport.ts';

async function connected(options: Partial<EmulatorOptions> = {}) {
  const emulator = createEmulator({ scenario: 'city', elapsed: () => 20, ...options });
  const client = new ElmClient(guardTransport(emulator));
  const info = await client.connect();
  return { emulator, client, info };
}

/** Largest rounding error each wire encoding can introduce. */
const TOLERANCE: Record<string, number> = { '0C': 0.25, '10': 0.01, '42': 0.001, '5E': 0.05, '0A': 3, '0E': 0.5 };
const toleranceFor = (pid: string) =>
  TOLERANCE[pid] ?? (pid >= '14' && pid <= '1B' ? 0.005 : ['06', '07', '08', '09'].includes(pid) ? 0.8 : 0.51);

describe('connect', () => {
  test('initialises the adapter in order and discovers supported PIDs', async () => {
    const { emulator, info } = await connected();
    expect(emulator.received.slice(0, 7)).toEqual(['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', '0100']);
    expect(info).toMatchObject({ adapter: 'ELM327 v1.5', protocol: '6', isCan: true });
    expect(info.supportedPids).toContain('0C');
    expect(info.supportedPids).toContain('46');
  });

  test('fails with the adapter error when the car does not answer', async () => {
    const emulator = createEmulator({ scenario: 'city', ignitionOff: true });
    await expect(new ElmClient(guardTransport(emulator)).connect()).rejects.toThrow('UNABLE_TO_CONNECT');
  });
});

describe('live data through the emulator', () => {
  test('decodes 20+ PIDs to the values the simulated car holds', async () => {
    const { emulator, client, info } = await connected();
    const expected = emulator.state().values;
    const queried = PIDS.filter((def) => info.supportedPids.includes(def.pid));
    expect(queried.length).toBeGreaterThanOrEqual(20);

    for (const def of queried) {
      const reading = await client.readPid(def.pid);
      expect(reading, def.pid).toBeDefined();
      expect(Math.abs(reading!.value - expected[def.pid]!), `PID ${def.pid}`).toBeLessThanOrEqual(toleranceFor(def.pid));
      expect(reading!.unit).toBe(def.unit);
    }
  });

  test('never asks for a PID the car does not support', async () => {
    const { emulator, client, info } = await connected();
    expect(info.supportedPids).not.toContain('0A');
    emulator.received.length = 0;
    expect(await client.readPid('0A')).toBeUndefined();
    expect(emulator.received).toEqual([]);
  });

  test('reads the battery voltage and the VIN', async () => {
    const { client, emulator } = await connected();
    expect(await client.readVoltage()).toBeCloseTo(emulator.state().voltage, 1);
    expect(await client.readVin()).toBe(emulator.state().vin);
  });

  test.each([
    ['spaces and echo that cannot be switched off', { ignoresFormatting: true }],
    ['doubled prompts, blank lines and NUL bytes', { noisy: true }],
  ])('copes with clone adapters: %s', async (_name, quirks) => {
    const { client, info } = await connected({ quirks, chunkSize: 3 });
    expect(info.supportedPids).toContain('0D');
    expect((await client.readPid('05'))?.value).toBeCloseTo(90, -1);
    expect(await client.readVin()).toHaveLength(17);
  });
});

describe('diagnostics', () => {
  test('healthy car: no codes, no lamp, no freeze frame', async () => {
    const { client } = await connected();
    expect(await client.readDtcs()).toEqual([]);
    expect(await client.readFreezeFrame()).toBeUndefined();
    expect((await client.readReadiness())?.milOn).toBe(false);
  });

  test.each(['can', 'kwp'] as const)('misfire scenario over %s: codes, freeze frame and lamp', async (bus) => {
    const { client, info } = await connected({ scenario: 'misfire', bus });
    expect(info.isCan).toBe(bus === 'can');
    const dtcs = await client.readDtcs();
    expect(dtcs).toContainEqual({ code: 'P0301', kind: 'stored', safetyCritical: false });
    expect(dtcs).toContainEqual({ code: 'P0300', kind: 'pending', safetyCritical: false });
    const frame = await client.readFreezeFrame();
    expect(frame?.dtc).toBe('P0301');
    expect(frame?.readings.map((r) => r.pid)).toEqual(expect.arrayContaining(['05', '0C', '0D']));
    const readiness = await client.readReadiness();
    expect(readiness).toMatchObject({ milOn: true, dtcCount: 1 });
    expect(await client.readVin()).toHaveLength(17);
  });

  test.each<[string, string]>([
    ['catalyst', 'P0420'],
    ['overheat', 'P0217'],
    ['lowVoltage', 'P0562'],
  ])('%s scenario stores %s', async (scenario, code) => {
    const { client } = await connected({ scenario: scenario as EmulatorOptions['scenario'] });
    expect((await client.readDtcs()).filter((d) => d.kind === 'stored').map((d) => d.code)).toEqual([code]);
  });

  test('all seven scenarios exist and answer', async () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['city', 'highway', 'coldStart', 'misfire', 'catalyst', 'overheat', 'lowVoltage']);
    for (const { id } of SCENARIOS) {
      const { client } = await connected({ scenario: id });
      expect((await client.readPid('0C'))?.value, id).toBeGreaterThan(500);
    }
  });

  test('scenarios evolve: cold engine warms up, overheating engine passes 110 °C, low battery reads under 12 V', async () => {
    let t = 0;
    const cold = createEmulator({ scenario: 'coldStart', elapsed: () => t });
    const start = cold.state().values['05']!;
    t = 600;
    expect(cold.state().values['05']!).toBeGreaterThan(start + 40);
    expect(createEmulator({ scenario: 'overheat', elapsed: () => 120 }).state().values['05']).toBeGreaterThan(110);
    expect(createEmulator({ scenario: 'lowVoltage', elapsed: () => 5 }).state().voltage).toBeLessThan(12);
  });
});

describe('command queue', () => {
  const clients: ElmClient[] = [];
  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
  });

  test('sends one command at a time even when callers overlap', async () => {
    const { emulator, client } = await connected({ latencyMs: 2 });
    const readings = await Promise.all(['0C', '0D', '05', '11'].map((pid) => client.readPid(pid)));
    expect(readings.map((r) => r?.pid)).toEqual(['0C', '0D', '05', '11']);
    expect(emulator.overlaps).toBe(0);
  });

  test('refuses a write command before anything reaches the adapter', async () => {
    const { emulator, client } = await connected();
    emulator.received.length = 0;
    await expect(client.send('04' as never)).rejects.toThrow(ForbiddenCommandError);
    expect(emulator.received).toEqual([]);
    expect((await client.readPid('0D'))?.pid).toBe('0D');
  });

  test('times out, then does not mistake the late answer for the next one', async () => {
    let deliver: (chunk: string) => void = () => {};
    const channel: RawChannel = {
      open: async () => {},
      close: async () => {},
      onData: (cb) => void (deliver = cb),
      send: async (data) => {
        if (data === '010C\r') setTimeout(() => deliver('410C1AF8\r\r>'), 40);
        else setTimeout(() => deliver('410D32\r\r>'), 5);
      },
    };
    const client = new ElmClient(guardTransport(channel), { drainMs: 100 });
    clients.push(client);
    await expect(client.send('010C', 10)).rejects.toThrow(ElmTimeoutError);
    expect(await client.send('010D', 200)).toEqual({ ok: true, lines: ['410D32'] });
  });
});

describe('polling', () => {
  test('reads fast PIDs often and slow ones rarely, without starving any', () => {
    const scheduler = new PollScheduler(
      [{ id: 'rpm', rate: 'fast' }, { id: 'speed', rate: 'fast' }, { id: 'fuel', rate: 'slow' }],
      { fast: 100, medium: 500, slow: 1000 },
    );
    const count: Record<string, number> = {};
    for (let now = 0; now < 5000; now += 40) {
      const id = scheduler.next(now);
      if (id) count[id] = (count[id] ?? 0) + 1;
    }
    expect(count.rpm).toBeGreaterThan(30);
    expect(count.speed).toBeGreaterThan(30);
    expect(count.fuel).toBeGreaterThanOrEqual(4);
    expect(count.fuel).toBeLessThanOrEqual(6);
  });

  test('streams readings including voltage, and recovers after the link drops', async () => {
    const { emulator, client } = await connected();
    const seen = new Set<string>();
    const statuses: string[] = [];
    let afterDrop = 0;
    let dropped = false;
    let recovered!: () => void;
    const done = new Promise<void>((resolve) => (recovered = resolve));

    const poller = createLivePoller(client, {
      intervals: { fast: 1, medium: 2, slow: 4 },
      retryDelayMs: 2,
      onStatus: (status) => statuses.push(status),
      onReading: (reading) => {
        seen.add(reading.pid);
        if (!dropped && seen.has('0C') && seen.has('RV') && seen.has('2F')) {
          dropped = true;
          emulator.drop();
        } else if (dropped && statuses.includes('connected') && ++afterDrop === 3) recovered();
      },
    });
    poller.start();
    await done;
    await poller.stop();

    expect(statuses).toEqual(['reconnecting', 'connected']);
  });
});

describe('simulator controls', () => {
  test('parking stops the car and idles the engine until released', () => {
    const emulator = createEmulator({ scenario: 'highway', elapsed: () => 30 });
    emulator.setParked(true);
    expect(emulator.state().values['0D']).toBe(0);
    expect(emulator.state().values['0C']).toBeLessThan(1000);
    emulator.setParked(false);
    expect(emulator.state().values['0D']).toBeGreaterThan(80);
  });
});

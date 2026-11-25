import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { createEmulator } from '@pitwall/obd-core/emulator';
import { openAdapter, parseAdapter } from '../src/adapter.ts';
import { configureClient } from '../src/connect.ts';
import { createMcpServer } from '../src/mcp.ts';
import { startBridge, type Bridge } from '../src/server.ts';
import { readTrips, saveTrips } from '../src/trips.ts';

const closers: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const temp = () => mkdtemp(join(tmpdir(), 'pitwall-'));

describe('adapter option', () => {
  test('understands serial, tcp and simulator forms', () => {
    expect(parseAdapter('serial:COM3')).toEqual({ kind: 'serial', path: 'COM3', baudRate: 38400 });
    expect(parseAdapter('serial:/dev/rfcomm0@115200')).toEqual({ kind: 'serial', path: '/dev/rfcomm0', baudRate: 115200 });
    expect(parseAdapter('tcp:192.168.0.10:35000')).toEqual({ kind: 'tcp', host: '192.168.0.10', port: 35000 });
    expect(parseAdapter('sim:misfire')).toEqual({ kind: 'sim', scenario: 'misfire' });
    expect(() => parseAdapter('sim:nope')).toThrow(/scenario/);
    expect(() => parseAdapter('usb')).toThrow(/Unknown adapter/);
  });
});

async function bridge() {
  const emulator = createEmulator({ scenario: 'city' });
  const dir = await temp();
  const server: Bridge = await startBridge({ channel: emulator, port: 0, code: 'ABC234', dataDir: dir });
  closers.push(() => server.close());
  return { emulator, server, dir };
}

/** Collects messages from a websocket client of the bridge. */
async function socket(port: number, origin = 'http://localhost:5173') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
  closers.push(() => ws.close());
  const inbox: any[] = [];
  ws.on('message', (data) => inbox.push(JSON.parse(String(data))));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const say = (message: unknown) => ws.send(JSON.stringify(message));
  const until = async (match: (m: any) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const found = inbox.find(match);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`no matching message in ${JSON.stringify(inbox)}`);
  };
  return { ws, say, until, inbox };
}

async function paired() {
  const setup = await bridge();
  const client = await socket(setup.server.port);
  client.say({ type: 'hello', code: 'ABC234' });
  await client.until((m) => m.type === 'ready');
  return { ...setup, client };
}

describe('bridge server', () => {
  test('listens on the loopback address only', async () => {
    const { server } = await bridge();
    expect(server.address).toBe('127.0.0.1');
  });

  test('passes read commands through after the right pairing code', async () => {
    const { client, emulator } = await paired();
    client.say({ type: 'write', data: 'ATRV\r' });
    expect((await client.until((m) => m.type === 'data')).data).toContain('V');
    expect(emulator.received).toEqual(['ATRV']);
  });

  test('a wrong code, or no code, reaches nothing', async () => {
    const { server, emulator } = await bridge();
    const client = await socket(server.port);
    client.say({ type: 'write', data: '010C\r' });
    await client.until((m) => m.message === 'not-paired');
    client.say({ type: 'hello', code: 'ZZZZZZ' });
    await client.until((m) => m.message === 'bad-code');
    expect(emulator.received).toEqual([]);
  });

  test('refuses write commands even from a paired client', async () => {
    const { client, emulator } = await paired();
    const forbidden = ['04\r', '010C\r04\r', 'ATMA\r', '010C', '2EF190\r', 7];
    for (const data of forbidden) client.say({ type: 'write', data });
    client.say({ type: 'write', data: '010D\r' });
    await client.until((m) => m.type === 'data');
    expect(emulator.received).toEqual(['010D']);
    expect(client.inbox.filter((m) => m.message === 'refused')).toHaveLength(forbidden.length);
  });

  test('rejects pages from other websites', async () => {
    const { server } = await bridge();
    await expect(socket(server.port, 'https://evil.example')).rejects.toThrow();
  });

  test('stops accepting codes after repeated wrong ones', async () => {
    const { server } = await bridge();
    const client = await socket(server.port);
    for (let i = 0; i < 5; i++) client.say({ type: 'hello', code: 'ZZZZZZ' });
    await client.until((m) => m.message === 'locked');
    const second = await socket(server.port);
    second.say({ type: 'hello', code: 'ABC234' });
    await second.until((m) => m.message === 'locked');
  });

  test('stores trip summaries without positions', async () => {
    const { client, dir } = await paired();
    client.say({ type: 'trips', trips: [{ id: '1', startedAt: 1, endedAt: 2, distanceKm: 3, track: [[29, 41]] }] });
    await expect.poll(async () => (await readTrips(dir)).length).toBe(1);
    expect(await readFile(join(dir, 'trips.json'), 'utf8')).not.toContain('track');
  });
});

async function mcp(adapter: string | undefined, showVin = false) {
  const dir = await temp();
  const handle = createMcpServer({ adapter: adapter ? openAdapter(parseAdapter(adapter)) : undefined, dataDir: dir, showVin });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await handle.server.connect(a);
  await client.connect(b);
  closers.push(
    () => client.close(),
    () => handle.close(),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result: any = await client.callTool({ name, arguments: args });
    return { text: result.content[0].text as string, isError: Boolean(result.isError) };
  };
  return { client, call, dir };
}

describe('MCP server', () => {
  test('offers exactly the seven read-only tools', async () => {
    const { client } = await mcp('sim:misfire');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'explain_dtc',
      'get_freeze_frame',
      'get_live_data',
      'get_readiness',
      'get_trip_summary',
      'get_vehicle_info',
      'read_dtcs',
    ]);
    for (const tool of tools) {
      expect(tool.description).toContain('Read-only. This server never clears codes or sends commands that change vehicle behavior.');
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  test('reads the faults of the simulated car with descriptions', async () => {
    const { call } = await mcp('sim:misfire');
    const dtcs = JSON.parse((await call('read_dtcs', { language: 'tr' })).text);
    expect(dtcs.codes[0]).toMatchObject({ code: 'P0301', kind: 'stored', safetyCritical: false });
    expect(dtcs.codes[0].description.title).toMatch(/silindir/);
    expect(JSON.parse((await call('get_freeze_frame')).text).dtc).toBe('P0301');
    expect(JSON.parse((await call('get_readiness')).text).milOn).toBe(true);
    const live = JSON.parse((await call('get_live_data', { pids: ['0C', 'coolantTemp'] })).text);
    expect(live.readings.map((r: any) => r.pid)).toEqual(['0C', '05']);
  });

  test('masks the VIN unless the user allowed it', async () => {
    const masked = JSON.parse((await (await mcp('sim:city')).call('get_vehicle_info')).text);
    expect(masked.vin).toContain('•');
    const shown = JSON.parse((await (await mcp('sim:city', true)).call('get_vehicle_info')).text);
    expect(shown.vin).toBe('NM0PW000000000001');
  });

  test('explains a code without any adapter, and says what is missing otherwise', async () => {
    const { call } = await mcp(undefined);
    expect((await call('explain_dtc', { code: 'p0420', language: 'en' })).text).toMatch(/Catalyst/i);
    const failed = await call('read_dtcs');
    expect(failed.isError).toBe(true);
    expect(failed.text).toMatch(/--serial|--tcp|--simulator/);
  });

  test('summarises stored trips', async () => {
    const { call, dir } = await mcp(undefined);
    await saveTrips(dir, [{ id: '1', startedAt: 0, endedAt: 60_000, distanceKm: 5, avgSpeed: 40, idleSec: 3, maxCoolantC: 90 }]);
    const summary = JSON.parse((await call('get_trip_summary')).text);
    expect(summary.trips).toHaveLength(1);
    expect(summary.totalKm).toBe(5);
  });
});

describe('connect command', () => {
  const server = { command: 'npx', args: ['-y', 'pitwall-obd', 'mcp', '--simulator', 'city'] };

  test.each([
    ['claude-desktop', 'mcpServers'],
    ['claude-code', 'mcpServers'],
    ['cursor', 'mcpServers'],
    ['vscode', 'servers'],
  ] as const)('%s: adds pitwall and keeps other servers', async (client, key) => {
    const path = join(await temp(), 'config.json');
    await writeFile(path, JSON.stringify({ [key]: { other: { command: 'x' } }, keep: true }));
    const result = await configureClient(client, server, { path });
    const written = JSON.parse(await readFile(result.path, 'utf8'));
    expect(written.keep).toBe(true);
    expect(written[key].other).toEqual({ command: 'x' });
    expect(written[key].pitwall).toMatchObject(server);
    expect(await readFile(`${path}.bak`, 'utf8')).toContain('other');
  });

  test('knows the usual file locations', async () => {
    const options = { home: '/home/u', cwd: '/proj', platform: 'linux' as const, dryRun: true };
    const paths = await Promise.all(
      (['claude-desktop', 'claude-code', 'cursor', 'vscode'] as const).map(async (client) =>
        (await configureClient(client, server, options)).path.replace(/\\/g, '/'),
      ),
    );
    expect(paths).toEqual([
      '/home/u/.config/Claude/claude_desktop_config.json',
      '/proj/.mcp.json',
      '/home/u/.cursor/mcp.json',
      '/proj/.vscode/mcp.json',
    ]);
  });

  test('never overwrites a file it cannot parse', async () => {
    const path = join(await temp(), 'broken.json');
    await writeFile(path, '{ not json');
    await expect(configureClient('cursor', server, { path })).rejects.toThrow(/not valid JSON/);
    expect(await readFile(path, 'utf8')).toBe('{ not json');
  });
});

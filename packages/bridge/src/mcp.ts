/** MCP server that lets an AI client read, and only read, the car. */
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { describeDtc } from '@pitwall/dtc-data';
import { decodeWmi, ElmClient, getPid, guardTransport, maskVin, PIDS, type RawChannel } from '@pitwall/obd-core';
import { readTrips } from './trips.ts';

export const READ_ONLY_NOTE =
  'Read-only. This server never clears codes or sends commands that change vehicle behavior.';

export interface McpOptions {
  /** Absent when the user configured no adapter: offline tools still work. */
  adapter: RawChannel | undefined;
  dataDir: string;
  showVin?: boolean;
}

const NO_ADAPTER =
  'No adapter configured. Start with --serial <port>, --tcp <host:port> or --simulator <scenario>, or set PITWALL_ADAPTER.';

const DEFAULT_LIVE = ['0C', '0D', '05', '04', '11', '0F', '10', '0B', '06', '07', '2F', '42'];
const language = z.enum(['tr', 'en']).default('en');

const reply = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }],
});

async function explain(code: string, lang: 'tr' | 'en') {
  const info = await describeDtc(code);
  if (info.manufacturerSpecific) {
    return { code, manufacturerSpecific: true, note: 'Manufacturer specific code; its meaning depends on the make.' };
  }
  const text = info[lang] ?? info.en;
  if (!text) return { code, note: 'Not in the offline database.' };
  return { code, ...text, symptoms: info.en?.symptoms, language: info[lang] ? lang : 'en' };
}

export function createMcpServer({ adapter, dataDir, showVin = false }: McpOptions) {
  const server = new McpServer({ name: 'pitwall', version: '0.1.0' });
  let client: ElmClient | undefined;
  let connecting: Promise<ElmClient> | undefined;

  /** Connects on first use and again after a failure. */
  function car(): Promise<ElmClient> {
    if (!adapter) return Promise.reject(new Error(NO_ADAPTER));
    connecting ??= (async () => {
      client ??= new ElmClient(guardTransport(adapter));
      await client.reconnect();
      return client;
    })().catch((error) => {
      connecting = undefined;
      throw error;
    });
    return connecting;
  }

  /** Tool calls share one adapter, so they run one at a time. */
  let queue: Promise<unknown> = Promise.resolve();
  function withCar<T>(work: (elm: ElmClient) => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      const elm = await car();
      try {
        return await work(elm);
      } catch (error) {
        connecting = undefined;
        throw error;
      }
    });
    queue = result.catch(() => {});
    return result;
  }

  const readOnly = (description: string) => ({
    description: `${description} ${READ_ONLY_NOTE}`,
    annotations: { readOnlyHint: true, destructiveHint: false },
  });

  server.registerTool('get_vehicle_info', { ...readOnly('Vehicle identification, protocol and supported PIDs.') }, async () =>
    reply(
      await withCar(async (elm) => {
        const vin = await elm.readVin();
        return {
          vin: vin ? (showVin ? vin : maskVin(vin)) : null,
          manufacturer: vin ? (decodeWmi(vin) ?? null) : null,
          protocol: elm.info!.protocolName,
          supportedPids: elm.info!.supportedPids.flatMap((pid) => {
            const def = getPid(pid);
            return def ? [{ pid, key: def.key, name: def.name.en, unit: def.unit }] : [];
          }),
        };
      }),
    ),
  );

  server.registerTool(
    'get_live_data',
    {
      ...readOnly('Current values of selected parameters. PIDs are hex ("0C") or keys ("coolantTemp").'),
      inputSchema: z.object({ pids: z.array(z.string()).max(40).optional() }),
    },
    async ({ pids }) =>
      reply(
        await withCar(async (elm) => {
          const wanted = (pids?.length ? pids : DEFAULT_LIVE).map(
            (p) => PIDS.find((d) => d.key === p)?.pid ?? p.toUpperCase(),
          );
          const readings = [];
          for (const pid of wanted) {
            const reading = await elm.readPid(pid);
            if (reading) readings.push({ pid, name: reading.name, value: Math.round(reading.value * 100) / 100, unit: reading.unit });
          }
          return { batteryVoltage: await elm.readVoltage(), readings };
        }),
      ),
  );

  server.registerTool(
    'read_dtcs',
    { ...readOnly('Stored, pending and permanent trouble codes with offline descriptions.'), inputSchema: z.object({ language }) },
    async ({ language: lang }) => {
      const dtcs = await withCar((elm) => elm.readDtcs());
      const codes = await Promise.all(
        dtcs.map(async (dtc) => ({ ...dtc, description: await explain(dtc.code, lang) })),
      );
      return reply({
        codes,
        note: 'Not a diagnosis. For safety critical codes tell the driver to stop safely or get service first.',
      });
    },
  );

  server.registerTool('get_freeze_frame', { ...readOnly('Values recorded when the fault was stored.') }, async () =>
    reply((await withCar((elm) => elm.readFreezeFrame())) ?? { dtc: null, readings: [] }),
  );

  server.registerTool('get_readiness', { ...readOnly('Inspection readiness monitors and warning lamp state.') }, async () =>
    reply((await withCar((elm) => elm.readReadiness())) ?? { note: 'The car did not report readiness.' }),
  );

  server.registerTool(
    'explain_dtc',
    {
      ...readOnly('Offline explanation of one trouble code. Needs no car.'),
      inputSchema: z.object({ code: z.string().regex(/^[PCBUpcbu][0-3][0-9A-Fa-f]{3}$/), language }),
    },
    async ({ code, language: lang }) => reply(await explain(code.toUpperCase(), lang)),
  );

  server.registerTool('get_trip_summary', { ...readOnly('Recent trips without any location data.') }, async () => {
    const trips = (await readTrips(dataDir)).slice(0, 20);
    const totalKm = Math.round(trips.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0) * 10) / 10;
    return reply({
      trips,
      totalKm,
      note: trips.length ? undefined : 'No trips yet. The web app shares summaries when connected through the bridge.',
    });
  });

  return {
    server,
    async close() {
      await client?.close().catch(() => {});
      await server.close();
    },
  };
}

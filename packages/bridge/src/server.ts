/**
 * Local websocket bridge between the web app and an adapter. Loopback only, protected
 * by a pairing code, and every command goes through the read-only allowlist again here.
 */
import { randomInt, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { assertAllowed, guardTransport, type RawChannel } from '@pitwall/obd-core';
import { defaultDataDir, saveTrips } from './trips.ts';

export const DEFAULT_PORT = 35100;
const HOST = '127.0.0.1';
const MAX_WRONG_CODES = 5;
/** No 0/O or 1/I, so the code is easy to type. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const newPairingCode = (): string => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** The hosted app and pages served from this machine. */
export const isAllowedOrigin = (origin: string | undefined): boolean =>
  origin === undefined ||
  origin === 'https://bertugbodur.github.io' ||
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

export interface BridgeOptions {
  channel: RawChannel;
  code?: string;
  port?: number;
  dataDir?: string;
  allowOrigin?: string;
}

export interface Bridge {
  address: string;
  port: number;
  code: string;
  close(): Promise<void>;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function startBridge(options: BridgeOptions): Promise<Bridge> {
  const code = options.code ?? newPairingCode();
  const dataDir = options.dataDir ?? defaultDataDir();
  // The raw channel stays in here; writes only ever go through the guard.
  const transport = guardTransport(options.channel);
  let active: WebSocket | undefined;
  let wrong = 0;

  const server = new WebSocketServer({
    host: HOST,
    port: options.port ?? DEFAULT_PORT,
    maxPayload: 256 * 1024,
    verifyClient: ({ origin }: { origin: string }) =>
      isAllowedOrigin(origin) || (options.allowOrigin !== undefined && origin === options.allowOrigin),
  });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });

  const say = (socket: WebSocket, message: object) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  const fail = (socket: WebSocket, message: string) => say(socket, { type: 'error', message });

  transport.onData((data) => active && say(active, { type: 'data', data }));

  async function handle(socket: WebSocket, message: any): Promise<void> {
    if (message?.type === 'hello') {
      if (wrong >= MAX_WRONG_CODES) return fail(socket, 'locked');
      if (!same(String(message.code ?? '').trim().toUpperCase(), code)) {
        wrong++;
        return fail(socket, wrong >= MAX_WRONG_CODES ? 'locked' : 'bad-code');
      }
      active?.close();
      active = undefined;
      try {
        await transport.close().catch(() => {});
        await transport.open();
      } catch (error) {
        return fail(socket, `adapter: ${error instanceof Error ? error.message : String(error)}`);
      }
      active = socket;
      return say(socket, { type: 'ready' });
    }
    if (socket !== active) return fail(socket, 'not-paired');

    if (message.type === 'write') {
      const data: unknown = message.data;
      if (typeof data !== 'string' || !data.endsWith('\r')) return fail(socket, 'refused');
      try {
        await transport.write(assertAllowed(data.slice(0, -1)));
      } catch {
        fail(socket, 'refused');
      }
    } else if (message.type === 'trips' && Array.isArray(message.trips)) {
      await saveTrips(dataDir, message.trips);
    }
  }

  server.on('connection', (socket) => {
    // Messages are handled one after another so a write can never overtake the pairing.
    let queue: Promise<unknown> = Promise.resolve();
    socket.on('message', (raw) => {
      queue = queue
        .then(() => handle(socket, JSON.parse(String(raw))))
        .catch(() => fail(socket, 'bad-message'));
    });
    socket.on('close', () => {
      if (active !== socket) return;
      active = undefined;
      void transport.close().catch(() => {});
    });
  });

  const address = server.address();
  return {
    address: typeof address === 'object' && address ? address.address : HOST,
    port: typeof address === 'object' && address ? address.port : (options.port ?? DEFAULT_PORT),
    code,
    async close() {
      for (const client of server.clients) client.terminate();
      await transport.close().catch(() => {});
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

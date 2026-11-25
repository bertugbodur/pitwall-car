/** Links to a real or simulated adapter from Node. */
import { connect, type Socket } from 'node:net';
import type { RawChannel } from '@pitwall/obd-core';
import { createEmulator, SCENARIOS, type ScenarioId } from '@pitwall/obd-core/emulator';

export type AdapterSpec =
  | { kind: 'serial'; path: string; baudRate: number }
  | { kind: 'tcp'; host: string; port: number }
  | { kind: 'sim'; scenario: ScenarioId };

/** Common address of Wi-Fi ELM327 adapters. */
export const WIFI_DEFAULT = '192.168.0.10:35000';

export function parseAdapter(text: string): AdapterSpec {
  const separator = text.indexOf(':');
  const kind = separator > 0 ? text.slice(0, separator) : '';
  const rest = text.slice(separator + 1);
  if (kind === 'serial') {
    const [path, baud] = rest.split('@');
    return { kind, path: path!, baudRate: Number(baud ?? 38400) };
  }
  if (kind === 'tcp') {
    const [host, port] = rest.split(':');
    return { kind, host: host!, port: Number(port ?? 35000) };
  }
  if (kind === 'sim') {
    const scenario = SCENARIOS.find((s) => s.id === rest);
    if (!scenario) throw new Error(`Unknown scenario "${rest}". Use one of: ${SCENARIOS.map((s) => s.id).join(', ')}`);
    return { kind, scenario: scenario.id };
  }
  throw new Error(`Unknown adapter "${text}". Use serial:<port>, tcp:<host:port> or sim:<scenario>.`);
}

function tcpChannel(host: string, port: number): RawChannel {
  let socket: Socket | undefined;
  let listener: (chunk: string) => void = () => {};
  return {
    open: () =>
      new Promise((resolve, reject) => {
        socket = connect({ host, port, timeout: 5000 });
        socket.setEncoding('latin1');
        socket.on('data', (chunk: string) => listener(chunk));
        socket.once('connect', () => {
          socket!.setTimeout(0);
          resolve();
        });
        socket.once('timeout', () => socket!.destroy(new Error(`No answer from ${host}:${port}`)));
        socket.once('error', reject);
        socket.on('error', () => {});
      }),
    send: (data) =>
      new Promise((resolve, reject) => {
        if (!socket || socket.destroyed) return reject(new Error('Adapter connection is closed'));
        socket.write(data, 'latin1', (error) => (error ? reject(error) : resolve()));
      }),
    onData(callback) {
      listener = callback;
    },
    async close() {
      socket?.destroy();
      socket = undefined;
    },
  };
}

function serialChannel(path: string, baudRate: number): RawChannel {
  let port: import('serialport').SerialPort | undefined;
  let listener: (chunk: string) => void = () => {};
  return {
    async open() {
      // Loaded only when needed: it carries a native binary.
      const { SerialPort } = await import('serialport');
      const next = new SerialPort({ path, baudRate, autoOpen: false });
      next.on('data', (data: Buffer) => listener(data.toString('latin1')));
      next.on('error', () => {});
      await new Promise<void>((resolve, reject) => next.open((error) => (error ? reject(error) : resolve())));
      port = next;
    },
    send: (data) =>
      new Promise((resolve, reject) => {
        if (!port?.isOpen) return reject(new Error('Serial port is closed'));
        port.write(data, 'latin1', (error) => (error ? reject(error) : resolve()));
      }),
    onData(callback) {
      listener = callback;
    },
    async close() {
      const current = port;
      port = undefined;
      if (current?.isOpen) await new Promise<void>((resolve) => current.close(() => resolve()));
    },
  };
}

export function openAdapter(spec: AdapterSpec): RawChannel {
  if (spec.kind === 'serial') return serialChannel(spec.path, spec.baudRate);
  if (spec.kind === 'tcp') return tcpChannel(spec.host, spec.port);
  return createEmulator({ scenario: spec.scenario });
}

import type { RawChannel } from '@pitwall/obd-core';

/** Talks to the local bridge (`npx pitwall-obd bridge`), used for Wi-Fi adapters. */

export const DEFAULT_BRIDGE_PORT = 35100;

export type BridgeMessage =
  | { type: 'hello'; code: string }
  | { type: 'ready' }
  | { type: 'write'; data: string }
  | { type: 'data'; data: string }
  /** Trip summaries without positions, kept by the bridge for MCP clients. */
  | { type: 'trips'; trips: unknown[] }
  | { type: 'error'; message: string };

export interface BridgeOptions {
  code: string;
  port?: number;
}

export class BridgeError extends Error {
  readonly reason: string;
  /** Retrying with the same code only locks the bridge. */
  readonly fatal: boolean;

  constructor(reason: string) {
    super(`Bridge: ${reason}`);
    this.name = 'BridgeError';
    this.reason = reason;
    this.fatal = reason === 'bad-code' || reason === 'locked';
  }
}

export function bridgeChannel({ code, port = DEFAULT_BRIDGE_PORT }: BridgeOptions): RawChannel & { shareTrips(trips: unknown[]): void } {
  let socket: WebSocket | undefined;
  let listener: (chunk: string) => void = () => {};
  const send = (message: BridgeMessage) => socket!.send(JSON.stringify(message));

  return {
    shareTrips(trips) {
      if (socket?.readyState === WebSocket.OPEN) send({ type: 'trips', trips });
    },
    open() {
      return new Promise((resolve, reject) => {
        // Always the loopback address: the pairing code never leaves this machine.
        socket = new WebSocket(`ws://127.0.0.1:${port}`);
        socket.onopen = () => send({ type: 'hello', code });
        socket.onerror = () => reject(new BridgeError('unreachable'));
        socket.onclose = () => reject(new BridgeError('closed'));
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data)) as BridgeMessage;
          if (message.type === 'data') listener(message.data);
          else if (message.type === 'ready') resolve();
          else if (message.type === 'error') reject(new BridgeError(message.message));
        };
      });
    },
    async send(data) {
      if (socket?.readyState !== WebSocket.OPEN) throw new BridgeError('closed');
      send({ type: 'write', data });
    },
    onData(callback) {
      listener = callback;
    },
    async close() {
      socket?.close();
      socket = undefined;
    },
  };
}

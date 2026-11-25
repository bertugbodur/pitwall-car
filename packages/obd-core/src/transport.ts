import { assertAllowed, type AllowedCommand } from './allowlist.ts';

/** A byte pipe to an adapter (serial, BLE, WebSocket, emulator). Never hand one to application code. */
export interface RawChannel {
  open(): Promise<void>;
  send(data: string): Promise<void>;
  onData(callback: (chunk: string) => void): void;
  close(): Promise<void>;
}

export interface Transport {
  open(): Promise<void>;
  write(command: AllowedCommand): Promise<void>;
  onData(callback: (chunk: string) => void): void;
  close(): Promise<void>;
}

/** The only way to build a Transport: every write is checked against the allowlist. */
export function guardTransport(channel: RawChannel): Transport {
  return Object.freeze({
    open: () => channel.open(),
    write: async (command: AllowedCommand) => {
      await channel.send(`${assertAllowed(command)}\r`);
    },
    onData: (callback: (chunk: string) => void) => channel.onData(callback),
    close: () => channel.close(),
  });
}

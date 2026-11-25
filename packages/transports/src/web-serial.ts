/// <reference types="w3c-web-serial" />
import type { RawChannel } from '@pitwall/obd-core';

/** USB adapters, and Bluetooth Classic adapters paired in the operating system. */
export function serialChannel(baudRate: number): RawChannel {
  let port: SerialPort | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let listener: (chunk: string) => void = () => {};
  let reading: Promise<void> = Promise.resolve();

  async function read(source: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    reader = source.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        listener(decoder.decode(value, { stream: true }));
      }
    } catch {
      // The device went away; the next write fails and triggers a reconnect.
    } finally {
      reader.releaseLock();
    }
  }

  return {
    async open() {
      // Reconnecting reuses the port the user already picked.
      port ??= await navigator.serial.requestPort();
      await port.open({ baudRate });
      if (port.readable) reading = read(port.readable);
    },
    async send(data) {
      const writer = port?.writable?.getWriter();
      if (!writer) throw new Error('Serial port is not open');
      try {
        await writer.write(new TextEncoder().encode(data));
      } finally {
        writer.releaseLock();
      }
    },
    onData(callback) {
      listener = callback;
    },
    async close() {
      await reader?.cancel().catch(() => {});
      await reading;
      await port?.close().catch(() => {});
    },
  };
}

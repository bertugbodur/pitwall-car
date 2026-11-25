/// <reference types="web-bluetooth" />
import type { RawChannel } from '@pitwall/obd-core';

const short = (id: number) => `0000${id.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;

/** GATT services used by common BLE ELM327 style adapters. Characteristics are found by their properties. */
export const BLE_PROFILES: readonly string[] = [
  short(0xfff0), // many clones
  short(0xffe0), // HM-10 modules
  short(0x18f0), // Vgate iCar Pro BLE and others
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // OBDLink CX / Vgate
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip transparent UART
];

/** Largest write that every BLE link accepts. */
const CHUNK = 20;

export function bleChannel(): RawChannel {
  let device: BluetoothDevice | undefined;
  let writer: BluetoothRemoteGATTCharacteristic | undefined;
  let notifier: BluetoothRemoteGATTCharacteristic | undefined;
  let listener: (chunk: string) => void = () => {};
  const decoder = new TextDecoder();

  const onValue = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (value) listener(decoder.decode(value, { stream: true }));
  };

  async function findCharacteristics(server: BluetoothRemoteGATTServer): Promise<void> {
    for (const id of BLE_PROFILES) {
      const service = await server.getPrimaryService(id).catch(() => undefined);
      if (!service) continue;
      const all = await service.getCharacteristics();
      const notify = all.find((c) => c.properties.notify || c.properties.indicate);
      const write = all.find((c) => c.properties.writeWithoutResponse || c.properties.write);
      if (notify && write) {
        notifier = notify;
        writer = write;
        return;
      }
    }
    throw new Error('This Bluetooth device does not look like an OBD adapter');
  }

  return {
    async open() {
      device ??= await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [...BLE_PROFILES] });
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Bluetooth connection failed');
      await findCharacteristics(server);
      notifier!.addEventListener('characteristicvaluechanged', onValue);
      await notifier!.startNotifications();
    },
    async send(data) {
      if (!writer || !device?.gatt?.connected) throw new Error('Bluetooth link is closed');
      const bytes = new TextEncoder().encode(data);
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const part = bytes.slice(i, i + CHUNK);
        if (writer.properties.writeWithoutResponse) await writer.writeValueWithoutResponse(part);
        else await writer.writeValueWithResponse(part);
      }
    },
    onData(callback) {
      listener = callback;
    },
    async close() {
      notifier?.removeEventListener('characteristicvaluechanged', onValue);
      device?.gatt?.disconnect();
      writer = undefined;
    },
  };
}

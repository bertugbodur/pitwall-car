/**
 * Links to an adapter. Only guarded transports leave this package, so every command
 * is checked against the read-only allowlist whatever the link.
 */
import { guardTransport, type Transport } from '@pitwall/obd-core';
import { createEmulator, type ScenarioId } from '@pitwall/obd-core/emulator';
import { bleChannel } from './web-bluetooth.ts';
import { serialChannel } from './web-serial.ts';
import { bridgeChannel, type BridgeOptions } from './websocket.ts';

export { BridgeError, DEFAULT_BRIDGE_PORT, type BridgeMessage, type BridgeOptions } from './websocket.ts';
export { BLE_PROFILES } from './web-bluetooth.ts';

export function transportSupport(): { serial: boolean; bluetooth: boolean } {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return { serial: !!nav && 'serial' in nav, bluetooth: !!nav && 'bluetooth' in nav };
}

export const createSerialTransport = (baudRate = 38400): Transport => guardTransport(serialChannel(baudRate));

export const createBleTransport = (): Transport => guardTransport(bleChannel());

export function createBridgeTransport(options: BridgeOptions): { transport: Transport; shareTrips(trips: unknown[]): void } {
  const channel = bridgeChannel(options);
  return { transport: guardTransport(channel), shareTrips: channel.shareTrips };
}

export interface SimulatorControls {
  setScenario(scenario: ScenarioId): void;
  setParked(parked: boolean): void;
}

export function createSimulatorTransport(scenario: ScenarioId): { transport: Transport; controls: SimulatorControls } {
  const emulator = createEmulator({ scenario, latencyMs: 8 });
  return {
    transport: guardTransport(emulator),
    controls: { setScenario: (next) => emulator.setScenario(next), setParked: (next) => emulator.setParked(next) },
  };
}

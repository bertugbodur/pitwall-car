import { create } from 'zustand';
import type { ConnectionInfo, Dtc, FreezeFrame, Readiness } from '@pitwall/obd-core';

export type Source = 'sim' | 'serial' | 'ble' | 'bridge';
export type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type Sample = [at: number, value: number];

export const HISTORY_POINTS = 600;

export interface LiveState {
  status: Status;
  source: Source | undefined;
  error: string | undefined;
  info: ConnectionInfo | undefined;
  vin: string | undefined;
  /** Latest value per PID; `RV` is the adapter voltage. */
  values: Record<string, number>;
  history: Record<string, Sample[]>;
  dtcs: Dtc[] | undefined;
  /** Codes the driver has not acknowledged yet. */
  newCodes: Dtc[];
  readiness: Readiness | undefined;
  freezeFrame: FreezeFrame | undefined;
  scanning: boolean;
  driving: boolean;
  parked: boolean;
  fuelLh: number | undefined;
  /** Fuel and distance since connecting, for the average. */
  usedL: number;
  drivenKm: number;
  /** All distance since connecting, with or without a fuel estimate. */
  odometerKm: number;
}

export const INITIAL: LiveState = {
  status: 'idle',
  source: undefined,
  error: undefined,
  info: undefined,
  vin: undefined,
  values: {},
  history: {},
  dtcs: undefined,
  newCodes: [],
  readiness: undefined,
  freezeFrame: undefined,
  scanning: false,
  driving: false,
  parked: true,
  fuelLh: undefined,
  usedL: 0,
  drivenKm: 0,
  odometerKm: 0,
};

export const useLive = create<LiveState>()(() => INITIAL);

export const useValue = (pid: string): number | undefined => useLive((s) => s.values[pid]);

export function recordValue(pid: string, value: number, at: number): void {
  useLive.setState((state) => {
    const previous = state.history[pid] ?? [];
    const next = previous.length >= HISTORY_POINTS ? previous.slice(1) : previous.slice();
    next.push([at, value]);
    return { values: { ...state.values, [pid]: value }, history: { ...state.history, [pid]: next } };
  });
}

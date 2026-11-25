/**
 * Chart recording lives outside the page, so it keeps running while the drive lock
 * replaces the screen.
 */
import { create } from 'zustand';
import type { PidReading } from '@pitwall/obd-core';

export const useRecorder = create<{ recording: boolean; count: number }>()(() => ({ recording: false, count: 0 }));

/** About two hours at the usual polling rate. */
const LIMIT = 300_000;
let rows: PidReading[] = [];

export const recordedRows = (): readonly PidReading[] => rows;

export function startRecording(): void {
  rows = [];
  useRecorder.setState({ recording: true, count: 0 });
}

export function stopRecording(): void {
  useRecorder.setState({ recording: false, count: rows.length });
}

export function addReading(reading: PidReading): void {
  if (!useRecorder.getState().recording || rows.length >= LIMIT) return;
  rows.push(reading);
  if (rows.length % 20 === 0) useRecorder.setState({ count: rows.length });
}

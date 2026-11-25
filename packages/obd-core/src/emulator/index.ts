import type { RawChannel } from '../transport.ts';
import { ENCODERS, encodeDtc } from './encode.ts';
import { SCENARIO_STATES, type ScenarioId, type VehicleState } from './scenarios.ts';

export { SCENARIOS, type Scenario, type ScenarioId, type VehicleState } from './scenarios.ts';

export interface EmulatorOptions {
  scenario: ScenarioId;
  /** Seconds since the engine started. Defaults to wall clock time. */
  elapsed?: () => number;
  /** `can` is ISO 15765-4, `kwp` an older ISO 14230-4 bus with different answer layouts. */
  bus?: 'can' | 'kwp';
  latencyMs?: number;
  /** Deliver answers in pieces of this many characters, as serial and BLE links do. */
  chunkSize?: number;
  ignitionOff?: boolean;
  quirks?: { noisy?: boolean; ignoresFormatting?: boolean };
}

export interface Emulator extends RawChannel {
  /** Every command received, in order. */
  readonly received: string[];
  /** Number of commands that arrived while an answer was still outstanding. */
  readonly overlaps: number;
  state(): VehicleState;
  setScenario(scenario: ScenarioId): void;
  /** Holds the simulated car at a standstill with the engine idling. */
  setParked(parked: boolean): void;
  /** Simulates a lost link; `open()` restores it. */
  drop(): void;
}

const VERSION = 'ELM327 v1.5';
const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

/** Catalyst, EVAP, O2 sensor, O2 heater and EGR monitors on a petrol engine. */
const MONITORS_SUPPORTED = 0xe5;

export function createEmulator(options: EmulatorOptions): Emulator {
  const bus = options.bus ?? 'can';
  const started = Date.now();
  const elapsed = options.elapsed ?? (() => (Date.now() - started) / 1000);
  let scenario = options.scenario;
  let listener: (chunk: string) => void = () => {};
  let open = true;
  let busy = false;
  let overlaps = 0;
  let searched = false;
  let echo = true;
  let linefeeds = true;
  let spaces = true;
  const received: string[] = [];

  let parked = false;
  const state = (): VehicleState => {
    const car = SCENARIO_STATES[scenario](elapsed());
    if (parked) Object.assign(car.values, { '04': 19, '0B': 34, '0C': 820, '0D': 0, '10': 3.1, '11': 12, '43': 17, '45': 6, '49': 0, '4C': 12, '5E': 1 });
    return car;
  };
  const line = (bytes: readonly number[]) => bytes.map(hex).join(spaces ? ' ' : '');

  /** Formats one answer the way an ELM327 with headers off prints it. */
  function frame(message: number[]): string[] {
    if (bus === 'kwp' || message.length <= 7) return [line(message)];
    const lines = [message.length.toString(16).toUpperCase().padStart(3, '0')];
    for (let offset = 0, index = 0; offset < message.length; index++) {
      const size = index === 0 ? 6 : 7;
      const part = message.slice(offset, offset + size);
      while (part.length < size) part.push(0);
      lines.push(`${(index % 16).toString(16).toUpperCase()}:${spaces ? ' ' : ''}${line(part)}`);
      offset += size;
    }
    return lines;
  }

  function bitmask(base: number, supported: readonly string[]): number[] {
    const mask = [0, 0, 0, 0];
    const pids = supported.map((p) => parseInt(p, 16));
    // The last bit says "ask for the next range too".
    if (pids.some((p) => p > base + 32)) pids.push(base + 32);
    for (const pid of pids) {
      const bit = pid - base - 1;
      if (bit >= 0 && bit < 32) mask[bit >> 3]! |= 0x80 >> (bit % 8);
    }
    return mask;
  }

  function currentData(pid: string, car: VehicleState): number[] | undefined {
    const number = parseInt(pid, 16);
    const supported = ['01', ...Object.keys(car.values)];
    if (number % 32 === 0) {
      const anyHigher = supported.some((p) => parseInt(p, 16) > number);
      return number === 0 || anyHigher ? bitmask(number, supported) : undefined;
    }
    if (pid === '01') {
      const lamp = car.stored.length > 0 ? 0x80 : 0;
      return [lamp | car.stored.length, 0x07, MONITORS_SUPPORTED, car.stored.length > 0 ? 0x01 : 0x00];
    }
    const value = car.values[pid];
    return value === undefined ? undefined : ENCODERS[pid]?.(value);
  }

  function codes(mode: number, list: readonly string[]): string[] {
    const pairs = list.flatMap(encodeDtc);
    if (bus === 'can') return frame([mode + 0x40, list.length, ...pairs]);
    if (list.length === 0) return ['NO DATA'];
    const lines: string[] = [];
    for (let i = 0; i < pairs.length; i += 6) {
      const slot = pairs.slice(i, i + 6);
      while (slot.length < 6) slot.push(0);
      lines.push(line([mode + 0x40, ...slot]));
    }
    return lines;
  }

  function vinLines(vin: string): string[] {
    const ascii = [...vin].map((c) => c.charCodeAt(0));
    if (bus === 'can') return frame([0x49, 0x02, 0x01, ...ascii]);
    const padded = [0, 0, 0, ...ascii];
    return [0, 1, 2, 3, 4].map((i) => line([0x49, 0x02, i + 1, ...padded.slice(i * 4, i * 4 + 4)]));
  }

  function obd(command: string): string[] {
    if (options.ignitionOff) return ['SEARCHING...', 'UNABLE TO CONNECT'];
    const car = state();
    const mode = command.slice(0, 2);
    const pid = command.slice(2, 4);

    if (mode === '01') {
      const data = currentData(pid, car);
      const answer = data ? frame([0x41, parseInt(pid, 16), ...data]) : ['NO DATA'];
      if (searched) return answer;
      searched = true;
      return ['SEARCHING...', ...answer];
    }
    if (mode === '02') {
      const freeze = car.freezeFrame;
      if (!freeze) return ['NO DATA'];
      if (pid === '02') return frame([0x42, 0x02, 0x00, ...encodeDtc(freeze.dtc)]);
      const value = freeze.values[pid];
      const data = value === undefined ? undefined : ENCODERS[pid]?.(value);
      return data ? frame([0x42, parseInt(pid, 16), 0x00, ...data]) : ['NO DATA'];
    }
    if (command === '03') return codes(0x03, car.stored);
    if (command === '07') return codes(0x07, car.pending);
    if (command === '0A') return codes(0x0a, car.permanent);
    if (command === '0902') return vinLines(car.vin);
    return mode === '09' ? ['NO DATA'] : ['?'];
  }

  function at(command: string): string[] {
    const locked = options.quirks?.ignoresFormatting;
    switch (command) {
      case 'ATZ':
      case 'ATWS':
        [echo, linefeeds, spaces, searched] = [true, true, true, false];
        return ['', VERSION];
      case 'ATI':
        return [VERSION];
      case 'ATE0':
        if (!locked) echo = false;
        return ['OK'];
      case 'ATL0':
        if (!locked) linefeeds = false;
        return ['OK'];
      case 'ATS0':
        if (!locked) spaces = false;
        return ['OK'];
      case 'ATRV':
        return [`${state().voltage.toFixed(1)}V`];
      case 'ATDPN':
        return [bus === 'can' ? 'A6' : 'A5'];
      case 'ATDP':
        return [bus === 'can' ? 'AUTO, ISO 15765-4 (CAN 11/500)' : 'AUTO, ISO 14230-4 (KWP FAST)'];
      case 'ATH0':
      case 'ATSP0':
      case 'ATAT1':
      case 'ATAT2':
        return ['OK'];
      default:
        return ['?'];
    }
  }

  function answer(command: string): string {
    const echoed = echo ? `${command}\r` : '';
    const lines = command.startsWith('AT') ? at(command) : obd(command);
    const eol = linefeeds ? '\r\n' : '\r';
    const body = `${echoed}${lines.join(eol)}${eol}${eol}>`;
    return options.quirks?.noisy ? `>\0\r${body.replace(/\r/g, '\r\r')}>` : body;
  }

  function deliver(text: string): void {
    const size = options.chunkSize ?? text.length;
    for (let i = 0; i < text.length; i += size) listener(text.slice(i, i + size));
    busy = false;
  }

  return {
    received,
    get overlaps() {
      return overlaps;
    },
    state,
    setScenario(next) {
      scenario = next;
    },
    setParked(next) {
      parked = next;
    },
    drop() {
      open = false;
    },
    async open() {
      open = true;
      busy = false;
    },
    async close() {
      open = false;
    },
    onData(callback) {
      listener = callback;
    },
    async send(data) {
      if (!open) throw new Error('Adapter link is closed');
      const command = data.replace(/\r$/, '');
      received.push(command);
      if (busy) overlaps++;
      busy = true;
      const text = answer(command);
      if (options.latencyMs) setTimeout(() => deliver(text), options.latencyMs);
      else queueMicrotask(() => deliver(text));
    },
  };
}

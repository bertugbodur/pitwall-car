import { assertAllowed, type AllowedCommand } from './allowlist.ts';
import { decodeDtc, DTC_MODES, isSafetyCritical, parseDtcMessages, type Dtc, type DtcKind } from './dtc.ts';
import { getPid, hex2, parseSupportedPids, type PidReading } from './pids.ts';
import { decodeReadiness, mergeReadiness, type Readiness } from './readiness.ts';
import { extractMessages, parseResponse, type ElmError, type ElmResponse } from './response.ts';
import type { Transport } from './transport.ts';
import { parseVin } from './vin.ts';

export class ElmTimeoutError extends Error {
  constructor(command: string) {
    super(`No answer from the adapter to ${command}`);
    this.name = 'ElmTimeoutError';
  }
}

export class ElmResponseError extends Error {
  readonly code: ElmError;

  constructor(command: string, code: ElmError) {
    super(`${command} failed: ${code}`);
    this.code = code;
    this.name = 'ElmResponseError';
  }
}

export interface ConnectionInfo {
  adapter: string;
  /** ELM327 protocol number, `1`-`C`. */
  protocol: string;
  protocolName: string;
  isCan: boolean;
  supportedPids: string[];
}

export interface FreezeFrame {
  dtc: string;
  readings: PidReading[];
}

export interface ElmClientOptions {
  timeoutMs?: number;
  /** How long to wait for a late answer after a timeout before sending the next command. */
  drainMs?: number;
  now?: () => number;
}

const PROTOCOLS: Record<string, string> = {
  '1': 'SAE J1850 PWM', '2': 'SAE J1850 VPW', '3': 'ISO 9141-2', '4': 'ISO 14230-4 KWP (5 baud)',
  '5': 'ISO 14230-4 KWP (fast)', '6': 'ISO 15765-4 CAN 11/500', '7': 'ISO 15765-4 CAN 29/500',
  '8': 'ISO 15765-4 CAN 11/250', '9': 'ISO 15765-4 CAN 29/250', A: 'SAE J1939 CAN', B: 'CAN 11/125', C: 'CAN 11/50',
};

const FREEZE_PIDS = ['04', '05', '06', '07', '0B', '0C', '0D', '0E', '0F', '11'];

export class ElmClient {
  info: ConnectionInfo | undefined;

  private readonly transport: Transport;
  private readonly timeoutMs: number;
  private readonly drainMs: number;
  private readonly now: () => number;
  private queue: Promise<unknown> = Promise.resolve();
  private buffer = '';
  private waiting: ((segment: string) => void) | undefined;
  /** Set after a timeout: the adapter may still send the old answer. */
  private stale = false;

  constructor(transport: Transport, options: ElmClientOptions = {}) {
    this.transport = transport;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.drainMs = options.drainMs ?? 1500;
    this.now = options.now ?? Date.now;
    transport.onData((chunk) => this.receive(chunk));
  }

  /** Queues one command. The adapter only ever sees one at a time. */
  send(command: AllowedCommand, timeoutMs = this.timeoutMs): Promise<ElmResponse> {
    const run = async () => {
      assertAllowed(command);
      return parseResponse(await this.exchange(command, timeoutMs), command);
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  async connect(): Promise<ConnectionInfo> {
    await this.transport.open();
    this.buffer = '';
    this.stale = false;

    const banner = await this.send('ATZ', 4000);
    for (const command of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'] as const) await this.send(command);

    const first = await this.send('0100', 15_000);
    if (!first.ok) throw new ElmResponseError('0100', first.error);

    const described = await this.send('ATDPN');
    const protocol = (described.ok ? (described.lines[0] ?? '') : '').replace(/^A(?=.)/, '');
    const supported = await this.discoverPids(first);

    this.info = {
      adapter: (banner.ok && banner.lines.find((l) => l.includes('ELM'))) || 'ELM327',
      protocol,
      protocolName: PROTOCOLS[protocol] ?? 'Unknown',
      isCan: /^[6-9ABC]$/.test(protocol),
      supportedPids: supported,
    };
    return this.info;
  }

  async reconnect(): Promise<ConnectionInfo> {
    await this.transport.close().catch(() => {});
    return this.connect();
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  /** Returns undefined when the car does not offer the PID or has no value for it right now. */
  async readPid(pid: string): Promise<PidReading | undefined> {
    const def = getPid(pid);
    if (!def || !this.info?.supportedPids.includes(pid)) return undefined;
    const data = await this.request(`01${pid}`, [0x41, parseInt(pid, 16)]);
    if (!data || data.length < def.bytes) return undefined;
    return { pid, name: def.name.en, value: def.decode(data), unit: def.unit, at: this.now() };
  }

  /** Voltage at the diagnostic port, measured by the adapter itself. */
  async readVoltage(): Promise<number | undefined> {
    const response = await this.send('ATRV');
    const value = response.ok ? parseFloat(response.lines[0] ?? '') : Number.NaN;
    return Number.isFinite(value) ? value : undefined;
  }

  async readDtcs(): Promise<Dtc[]> {
    const result: Dtc[] = [];
    for (const [kind, mode] of Object.entries(DTC_MODES) as [DtcKind, number][]) {
      const command = hex2(mode) as AllowedCommand;
      const response = await this.send(command, 5000);
      if (!response.ok) {
        // Older cars do not implement every code service.
        if (response.error === 'NO_DATA' || response.error === 'UNKNOWN_COMMAND') continue;
        throw new ElmResponseError(command, response.error);
      }
      for (const code of parseDtcMessages(extractMessages(response.lines), mode, this.info?.isCan ?? true)) {
        result.push({ code, kind, safetyCritical: isSafetyCritical(code) });
      }
    }
    return result;
  }

  async readFreezeFrame(): Promise<FreezeFrame | undefined> {
    const cause = await this.request('020200', [0x42, 0x02]);
    const [, a = 0, b = 0] = cause ?? [];
    if (!a && !b) return undefined;

    const readings: PidReading[] = [];
    for (const pid of FREEZE_PIDS) {
      const def = getPid(pid)!;
      if (!this.info?.supportedPids.includes(pid)) continue;
      const answer = await this.request(`02${pid}00`, [0x42, parseInt(pid, 16)]);
      const data = answer?.slice(1); // first byte is the frame number
      if (!data || data.length < def.bytes) continue;
      readings.push({ pid, name: def.name.en, value: def.decode(data), unit: def.unit, at: this.now() });
    }
    return { dtc: decodeDtc(a, b), readings };
  }

  async readReadiness(): Promise<Readiness | undefined> {
    const response = await this.send('0101');
    if (!response.ok) {
      if (response.error === 'NO_DATA') return undefined;
      throw new ElmResponseError('0101', response.error);
    }
    const answers = extractMessages(response.lines).filter((m) => m[0] === 0x41 && m[1] === 0x01 && m.length >= 6);
    return mergeReadiness(answers.map((m) => decodeReadiness(m.slice(2))));
  }

  async readVin(): Promise<string | undefined> {
    const response = await this.send('0902', 5000);
    return response.ok ? parseVin(extractMessages(response.lines)) : undefined;
  }

  /** Sends an OBD request and returns the bytes following the expected header. */
  private async request(command: AllowedCommand, header: readonly number[]): Promise<number[] | undefined> {
    const response = await this.send(command);
    if (!response.ok) {
      if (response.error === 'NO_DATA') return undefined;
      throw new ElmResponseError(command, response.error);
    }
    const message = extractMessages(response.lines).find((m) => header.every((byte, i) => m[i] === byte));
    return message?.slice(header.length);
  }

  private async discoverPids(first: Extract<ElmResponse, { ok: true }>): Promise<string[]> {
    const supported = new Set<string>();
    for (const base of [0x00, 0x20, 0x40, 0x60]) {
      if (base > 0 && !supported.has(hex2(base))) break;
      const response = base === 0 ? first : await this.send(`01${hex2(base)}`);
      if (!response.ok) break;
      // Several control units may answer; a PID any of them supports is usable.
      for (const message of extractMessages(response.lines)) {
        if (message[0] !== 0x41 || message[1] !== base) continue;
        for (const pid of parseSupportedPids(base, message.slice(2))) supported.add(pid);
      }
    }
    return [...supported].sort();
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let prompt: number;
    while ((prompt = this.buffer.indexOf('>')) >= 0) {
      const segment = this.buffer.slice(0, prompt);
      this.buffer = this.buffer.slice(prompt + 1);
      // Clones sometimes send an extra prompt with nothing before it.
      if (segment.replace(/[\s\0]/g, '') !== '') this.waiting?.(segment);
    }
  }

  private async exchange(command: AllowedCommand, timeoutMs: number): Promise<string> {
    if (this.stale) {
      await this.nextSegment(this.drainMs).catch(() => {});
      this.stale = false;
    }
    this.buffer = '';
    const answer = this.nextSegment(timeoutMs, command);
    // A failed write must not leave the timer running as an unhandled rejection.
    answer.catch(() => {});
    try {
      await this.transport.write(command);
    } catch (error) {
      this.waiting?.('');
      throw error;
    }
    return answer;
  }

  private nextSegment(timeoutMs: number, command = ''): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        this.stale = true;
        reject(new ElmTimeoutError(command));
      }, timeoutMs);
      this.waiting = (segment) => {
        clearTimeout(timer);
        this.waiting = undefined;
        resolve(segment);
      };
    });
  }
}

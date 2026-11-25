import { ElmResponseError, type ElmClient } from './client.ts';
import { getPid, type PidReading, type PollRate } from './pids.ts';

export type PollIntervals = Record<PollRate, number>;

export const DEFAULT_INTERVALS: PollIntervals = { fast: 100, medium: 1000, slow: 5000 };

export interface PollItem {
  id: string;
  rate: PollRate;
}

/** Picks the item that is most overdue, so slow items are never starved by fast ones. */
export class PollScheduler {
  private readonly due = new Map<string, number>();

  private readonly items: readonly PollItem[];
  private readonly intervals: PollIntervals;

  constructor(items: readonly PollItem[], intervals: PollIntervals) {
    this.items = items;
    this.intervals = intervals;
  }

  next(now: number): string | undefined {
    let best: PollItem | undefined;
    let bestDue = Number.POSITIVE_INFINITY;
    for (const item of this.items) {
      const due = this.due.get(item.id) ?? Number.NEGATIVE_INFINITY;
      if (due <= now && (best === undefined || due < bestDue)) {
        best = item;
        bestDue = due;
      }
    }
    if (best) this.due.set(best.id, now + this.intervals[best.rate]);
    return best?.id;
  }
}

/** `lost` means retrying is pointless (for example a rejected pairing code). */
export type LinkStatus = 'connected' | 'reconnecting' | 'lost';

/** Pseudo PID for the adapter's own voltage reading. */
export const VOLTAGE_ID = 'RV';

export interface LivePollerOptions {
  /** PIDs to read; defaults to every supported one. */
  pids?: readonly string[];
  intervals?: Partial<PollIntervals>;
  onReading(reading: PidReading): void;
  onStatus?(status: LinkStatus): void;
  onError?(error: unknown): void;
  /** Consecutive failures before the link is reopened. */
  maxFailures?: number;
  retryDelayMs?: number;
}

export interface LivePoller {
  start(): void;
  stop(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLivePoller(client: ElmClient, options: LivePollerOptions): LivePoller {
  const { maxFailures = 3, retryDelayMs = 1000 } = options;
  const intervals = { ...DEFAULT_INTERVALS, ...options.intervals };
  let running = false;
  let loop: Promise<void> = Promise.resolve();

  const items = (): PollItem[] => {
    const supported = client.info?.supportedPids ?? [];
    const wanted = options.pids?.filter((pid) => supported.includes(pid)) ?? supported;
    return [
      ...wanted.flatMap((pid) => {
        const def = getPid(pid);
        return def ? [{ id: pid, rate: def.rate }] : [];
      }),
      { id: VOLTAGE_ID, rate: 'medium' },
    ];
  };

  const read = async (id: string): Promise<PidReading | undefined> => {
    if (id !== VOLTAGE_ID) return client.readPid(id);
    const value = await client.readVoltage();
    return value === undefined ? undefined : { pid: id, name: 'Battery voltage', value, unit: 'V', at: Date.now() };
  };

  const recover = async () => {
    options.onStatus?.('reconnecting');
    for (let delay = retryDelayMs; running; delay = Math.min(delay * 2, 10_000)) {
      await sleep(delay);
      if (!running) return;
      try {
        await client.reconnect();
        options.onStatus?.('connected');
        return;
      } catch (error) {
        options.onError?.(error);
        if ((error as { fatal?: boolean } | undefined)?.fatal) {
          running = false;
          options.onStatus?.('lost');
          return;
        }
      }
    }
  };

  const run = async () => {
    const scheduler = new PollScheduler(items(), intervals);
    let failures = 0;
    while (running) {
      const id = scheduler.next(Date.now());
      if (!id) {
        await sleep(Math.min(intervals.fast, 20));
        continue;
      }
      try {
        const reading = await read(id);
        failures = 0;
        if (reading && running) options.onReading(reading);
      } catch (error) {
        options.onError?.(error);
        // A single PID refusing to answer is not a broken link.
        const linkLost = !(error instanceof ElmResponseError) || error.code === 'UNABLE_TO_CONNECT';
        if (linkLost || error.code === 'CAN_ERROR') failures++;
        if (failures >= maxFailures) {
          await recover();
          failures = 0;
        }
      }
      // Yield to the event loop even when the adapter answers instantly.
      await sleep(0);
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      loop = run();
    },
    async stop() {
      running = false;
      await loop;
    },
  };
}

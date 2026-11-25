import { describe, expect, test } from 'vitest';
import { ElmClient } from '../src/client.ts';
import { createEmulator } from '../src/emulator/index.ts';
import { createLivePoller } from '../src/poller.ts';
import { decodeReadiness, mergeReadiness } from '../src/readiness.ts';
import { guardTransport } from '../src/transport.ts';

describe('several control units answering readiness', () => {
  test('lamp and monitors are combined, whichever answers first', () => {
    const gearbox = decodeReadiness([0x00, 0x04, 0x00, 0x00]);
    const engine = decodeReadiness([0x82, 0x07, 0xe5, 0x05]);
    for (const order of [[gearbox, engine], [engine, gearbox]]) {
      const merged = mergeReadiness(order)!;
      expect(merged).toMatchObject({ milOn: true, dtcCount: 2, ignition: 'spark' });
      expect(merged.monitors.find((m) => m.id === 'catalyst')?.status).toBe('incomplete');
      expect(merged.monitors.find((m) => m.id === 'components')?.status).toBe('complete');
    }
    expect(mergeReadiness([])).toBeUndefined();
  });
});

describe('reconnecting', () => {
  test('gives up on a fatal error instead of retrying', async () => {
    const emulator = createEmulator({ scenario: 'city' });
    let refuse = false;
    let attempts = 0;
    const open = emulator.open;
    emulator.open = async () => {
      if (!refuse) return open();
      attempts++;
      throw Object.assign(new Error('bad code'), { fatal: true });
    };
    const client = new ElmClient(guardTransport(emulator));
    await client.connect();
    let lost!: (status: string) => void;
    const done = new Promise<string>((resolve) => (lost = resolve));
    const poller = createLivePoller(client, {
      retryDelayMs: 1,
      onReading: () => {
        if (refuse) return;
        refuse = true;
        emulator.drop();
      },
      onStatus: (status) => status === 'lost' && lost(status),
    });
    poller.start();
    expect(await done).toBe('lost');
    await poller.stop();
    expect(attempts).toBe(1);
  });
});

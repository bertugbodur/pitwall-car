import { describe, expect, test } from 'vitest';
import { assertAllowed, ForbiddenCommandError, isAllowedCommand } from '../src/allowlist.ts';
import { guardTransport, type RawChannel } from '../src/transport.ts';

function recordingChannel() {
  const sent: string[] = [];
  const channel: RawChannel = {
    open: async () => {},
    send: async (data) => void sent.push(data),
    onData: () => {},
    close: async () => {},
  };
  return { sent, channel };
}

const FORBIDDEN = [
  // clearing codes and every other writing / actuating service
  '04', '0400', '04 00', '08', '0801', '05', '06', '0B', '10', '1003', '11', '1101', '14', '14FFFFFF',
  '27', '2701', '28', '2E', '2EF190', '2F', '31', '3101', '34', '36', '3E', '85',
  // adapter commands that monitor, reconfigure or persist
  'AT MA', 'ATMA', 'ATMR10', 'ATMT10', 'AT BRD', 'ATBRD23', 'ATBRT', 'ATSH7E0', 'ATPP2CSV81', 'ATPPFFON',
  'ATCRA', 'ATSD', 'ATLP', 'ATCSM0', 'AT@3', 'ATWM', 'ATSW',
  // malformed, injected or random input
  '', ' ', '\r', '010C\r04', '010C\r', '010C\n', '03\r04', '0104\r\n04', ' 04', '03 ', '01 0C', '010c', 'atz',
  '01', '010', '010C0', '010C01', '09', '0902FF', '0300', '0700', '0A00', '02', '020C000', 'STMA', 'STPX', 'hello', 'FF',
];

const ALLOWED = [
  'ATZ', 'ATWS', 'ATI', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', 'ATAT1', 'ATAT2', 'ATDP', 'ATDPN', 'ATRV',
  '0100', '010C', '010D', '0120', '01FF', '0202', '020200', '020C00', '03', '07', '0A', '0900', '0902', '090A',
];

const READ_ONLY_SHAPE =
  /^(AT(Z|WS|I|E0|L0|S0|H0|SP0|AT[12]|DPN?|RV)|0[19][0-9A-F]{2}|02[0-9A-F]{2}([0-9A-F]{2})?|03|07|0A)$/;

describe('command allowlist', () => {
  test.each(FORBIDDEN)('rejects %j', (cmd) => {
    expect(isAllowedCommand(cmd)).toBe(false);
    expect(() => assertAllowed(cmd)).toThrow(ForbiddenCommandError);
  });

  test.each(ALLOWED)('accepts %j', (cmd) => {
    expect(isAllowedCommand(cmd)).toBe(true);
  });

  test('rejects non-string input, even something that stringifies to an allowed command', () => {
    const sneaky = { toString: () => '03' };
    for (const value of [undefined, null, 3, ['03'], sneaky]) {
      expect(isAllowedCommand(value as unknown as string)).toBe(false);
    }
  });

  test('no random string outside the read services gets through', () => {
    let seed = 1;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const alphabet = '0123456789ABCDEFTSMPHRZ \r';
    for (let i = 0; i < 20_000; i++) {
      const length = 1 + Math.floor(random() * 6);
      const cmd = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      if (isAllowedCommand(cmd)) expect(cmd).toMatch(READ_ONLY_SHAPE);
    }
  });
});

describe('guarded transport', () => {
  test('a forbidden command is rejected and never reaches the wire', async () => {
    const { sent, channel } = recordingChannel();
    const transport = guardTransport(channel);
    for (const cmd of FORBIDDEN) {
      await expect(transport.write(cmd as never)).rejects.toThrow(ForbiddenCommandError);
    }
    expect(sent).toEqual([]);
  });

  test('an allowed command is sent terminated with a carriage return', async () => {
    const { sent, channel } = recordingChannel();
    await guardTransport(channel).write('010C');
    expect(sent).toEqual(['010C\r']);
  });

  test('does not expose the raw send function', () => {
    const transport = guardTransport(recordingChannel().channel);
    expect(Object.keys(transport).sort()).toEqual(['close', 'onData', 'open', 'write']);
    expect(Object.isFrozen(transport)).toBe(true);
  });
});

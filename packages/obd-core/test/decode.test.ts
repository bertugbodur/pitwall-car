import { describe, expect, test } from 'vitest';
import { extractMessages, parseResponse } from '../src/response.ts';
import { decodePid, PIDS, parseSupportedPids } from '../src/pids.ts';
import { decodeDtc, isSafetyCritical, parseDtcMessages, isManufacturerSpecific } from '../src/dtc.ts';
import { decodeReadiness } from '../src/readiness.ts';
import { decodeWmi, parseVin } from '../src/vin.ts';

const bytes = (hex: string) => hex.replace(/\s/g, '').match(/../g)!.map((h) => parseInt(h, 16));

describe('response parsing', () => {
  test('drops echo, prompt, blank lines, NUL bytes and progress noise', () => {
    const raw = '010C\r\r\0SEARCHING...\r410C1AF8\r\r>>';
    expect(parseResponse(raw, '010C')).toEqual({ ok: true, lines: ['410C1AF8'] });
  });

  test.each([
    ['NO DATA', 'NO_DATA'],
    ['?', 'UNKNOWN_COMMAND'],
    ['STOPPED', 'STOPPED'],
    ['CAN ERROR', 'CAN_ERROR'],
    ['UNABLE TO CONNECT', 'UNABLE_TO_CONNECT'],
    ['BUS INIT: ...ERROR', 'BUS_ERROR'],
    ['BUS BUSY', 'BUS_ERROR'],
    ['DATA ERROR', 'DATA_ERROR'],
    ['<DATA ERROR', 'DATA_ERROR'],
    ['BUFFER FULL', 'DATA_ERROR'],
  ])('reports %j as %s', (line, error) => {
    expect(parseResponse(`${line}\r>`, '010C')).toEqual({ ok: false, error });
  });

  test('keeps data that follows a successful bus init banner', () => {
    expect(parseResponse('BUS INIT: ...OK\r410D32\r>', '010D')).toEqual({ ok: true, lines: ['410D32'] });
  });

  test('accepts spaced bytes from clones that ignore ATS0', () => {
    expect(extractMessages(['41 0C 1A F8 '])).toEqual([[0x41, 0x0c, 0x1a, 0xf8]]);
  });

  test('keeps one message per answering ECU', () => {
    expect(extractMessages(['4100BE3EB811', '410080000001'])).toHaveLength(2);
  });

  test('reassembles an indexed CAN multi-frame answer and trims padding', () => {
    const lines = ['014', '0:490201573041', '1:4A4A4A4A4A4A4A', '2:31323334353637'];
    expect(extractMessages(lines)).toEqual([bytes('490201 573041 4A4A4A4A4A4A4A 31323334353637').slice(0, 0x14)]);
  });

  test('ignores lines that are not hex', () => {
    expect(extractMessages(['ELM327 v1.5', '410D00'])).toEqual([[0x41, 0x0d, 0x00]]);
  });
});

describe('mode 01 decoders (SAE J1979 formulas)', () => {
  test.each<[string, string, number]>([
    ['04', '7F', 49.8039],
    ['05', '7B', 83],
    ['06', '90', 12.5],
    ['07', '70', -12.5],
    ['08', '80', 0],
    ['09', '00', -100],
    ['0A', '64', 300],
    ['0B', '63', 99],
    ['0C', '1AF8', 1726],
    ['0D', '32', 50],
    ['0E', '90', 8],
    ['0F', '41', 25],
    ['10', '01F4', 5],
    ['11', '33', 20],
    ['14', '5AFF', 0.45],
    ['15', '9080', 0.72],
    ['1F', '012C', 300],
    ['21', '000A', 10],
    ['2F', '80', 50.196],
    ['31', '1F40', 8000],
    ['33', '65', 101],
    ['42', '3714', 14.1],
    ['43', '0066', 40],
    ['45', '1A', 10.196],
    ['46', '3C', 20],
    ['49', '4D', 30.196],
    ['4C', '26', 14.902],
    ['5C', '82', 90],
    ['5E', '0064', 5],
  ])('PID %s with %s is %d', (pid, hex, expected) => {
    expect(decodePid(pid, bytes(hex))).toBeCloseTo(expected, 3);
  });

  test('every defined PID declares names in both languages, a unit and a sane range', () => {
    expect(PIDS.length).toBeGreaterThanOrEqual(20);
    for (const def of PIDS) {
      expect(def.name.en && def.name.tr, def.pid).toBeTruthy();
      expect(def.min, def.pid).toBeLessThan(def.max);
    }
  });

  test('returns undefined for unknown PIDs and truncated data', () => {
    expect(decodePid('FE', [1, 2])).toBeUndefined();
    expect(decodePid('0C', [0x1a])).toBeUndefined();
  });

  test('reads the supported-PID bitmask', () => {
    // BE 1F A8 13 is the classic example answer to 0100
    expect(parseSupportedPids(0x00, bytes('BE1FA813'))).toEqual([
      '01', '03', '04', '05', '06', '07', '0C', '0D', '0E', '0F', '10', '11', '13', '15', '1C', '1F', '20',
    ]);
    expect(parseSupportedPids(0x20, bytes('80000001'))).toEqual(['21', '40']);
  });
});

describe('trouble codes', () => {
  test.each<[string, string]>([
    ['0301', 'P0301'],
    ['0420', 'P0420'],
    ['4035', 'C0035'],
    ['9234', 'B1234'],
    ['C100', 'U0100'],
    ['1A2B', 'P1A2B'],
  ])('bytes %s are code %s', (hex, code) => {
    const [a, b] = bytes(hex) as [number, number];
    expect(decodeDtc(a, b)).toBe(code);
  });

  test('CAN answers carry a count byte and zero padding', () => {
    expect(parseDtcMessages([bytes('4302 0301 0420 0000')], 0x03, true)).toEqual(['P0301', 'P0420']);
    expect(parseDtcMessages([bytes('4300')], 0x03, true)).toEqual([]);
  });

  test('older protocols send three code slots per line and no count', () => {
    const messages = [bytes('47 0301 0000 0000'), bytes('47 0420 0000 0000')];
    expect(parseDtcMessages(messages, 0x07, false)).toEqual(['P0301', 'P0420']);
  });

  test('merges duplicate codes reported by two ECUs and ignores other services', () => {
    const messages = [bytes('4A01 0301'), bytes('4A01 0301'), bytes('4301 0420')];
    expect(parseDtcMessages(messages, 0x0a, true)).toEqual(['P0301']);
  });

  test.each(['P0217', 'P0524', 'P0520', 'C0035', 'B0001', 'P0118'])('%s is safety critical', (code) => {
    expect(isSafetyCritical(code)).toBe(true);
  });

  test.each(['P0420', 'P0171', 'P0455', 'U0155'])('%s is not safety critical', (code) => {
    expect(isSafetyCritical(code)).toBe(false);
  });

  test('knows which codes are manufacturer specific', () => {
    expect(['P1234', 'P3012', 'C1201', 'B1000', 'U1000'].every(isManufacturerSpecific)).toBe(true);
    expect(['P0301', 'P2002', 'P3400', 'U0100'].some(isManufacturerSpecific)).toBe(false);
  });
});

describe('readiness monitors', () => {
  test('spark ignition: MIL, code count and incomplete monitors', () => {
    // MIL on with 2 codes; catalyst, evap, O2, O2 heater, EGR supported; catalyst and evap not finished
    const result = decodeReadiness(bytes('82 07 E5 05'));
    expect(result.milOn).toBe(true);
    expect(result.dtcCount).toBe(2);
    expect(result.ignition).toBe('spark');
    const status = Object.fromEntries(result.monitors.map((m) => [m.id, m.status]));
    expect(status).toEqual({
      misfire: 'complete',
      fuelSystem: 'complete',
      components: 'complete',
      catalyst: 'incomplete',
      heatedCatalyst: 'unsupported',
      evap: 'incomplete',
      secondaryAir: 'unsupported',
      particulateFilter: 'unsupported',
      oxygenSensor: 'complete',
      oxygenSensorHeater: 'complete',
      egrVvt: 'complete',
    });
  });

  test('compression ignition uses the diesel monitor set', () => {
    const result = decodeReadiness(bytes('00 0F 4B 02'));
    expect(result.ignition).toBe('compression');
    const status = Object.fromEntries(result.monitors.map((m) => [m.id, m.status]));
    expect(status).toMatchObject({
      nmhcCatalyst: 'complete',
      noxScr: 'incomplete',
      boostPressure: 'complete',
      exhaustGasSensor: 'unsupported',
      pmFilter: 'complete',
    });
  });
});

describe('VIN', () => {
  const vin = 'WVWZZZ1KZAW000001';
  const ascii = [...vin].map((c) => c.charCodeAt(0));

  test('reads a CAN answer', () => {
    expect(parseVin([[0x49, 0x02, 0x01, ...ascii]])).toBe(vin);
  });

  test('reads a line-numbered answer from older protocols, in any order', () => {
    const padded = [0, 0, 0, ...ascii];
    const messages = [0, 1, 2, 3, 4].map((i) => [0x49, 0x02, i + 1, ...padded.slice(i * 4, i * 4 + 4)]);
    expect(parseVin([...messages].reverse())).toBe(vin);
  });

  test('returns undefined for an incomplete VIN', () => {
    expect(parseVin([[0x49, 0x02, 0x01, 0x57, 0x56]])).toBeUndefined();
  });

  test('names the manufacturer from the first three characters', () => {
    expect(decodeWmi(vin)).toBe('Volkswagen');
    expect(decodeWmi('NM0AAAAA000000000')).toBe('Ford Otosan');
    expect(decodeWmi('ZZ9AAAAA000000000')).toBeUndefined();
  });
});

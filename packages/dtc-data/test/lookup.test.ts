import { describe, expect, test } from 'vitest';
import { describeDtc, searchDtc, TURKISH_CODES } from '../src/index.ts';

describe('offline code descriptions', () => {
  test('P0301 in Turkish and English with causes', async () => {
    const info = await describeDtc('P0301');
    expect(info.en?.title).toMatch(/cylinder 1/i);
    expect(info.tr?.title).toMatch(/1\. silindir/i);
    expect(info.tr?.causes.length).toBeGreaterThan(1);
    expect(info.en?.causes.length).toBeGreaterThan(1);
    expect(info.manufacturerSpecific).toBe(false);
  });

  test('has roughly 300 Turkish entries, all of them real OBDex codes', async () => {
    expect(TURKISH_CODES.length).toBeGreaterThanOrEqual(290);
    const unknown = [];
    for (const code of TURKISH_CODES) if (!(await describeDtc(code)).en) unknown.push(code);
    expect(unknown).toEqual([]);
  });

  test('manufacturer specific codes are flagged and have no invented text', async () => {
    expect(await describeDtc('P1234')).toEqual({ code: 'P1234', manufacturerSpecific: true });
  });

  test('unknown or malformed codes do not throw', async () => {
    expect((await describeDtc('P0ZZZ')).en).toBeUndefined();
    expect((await describeDtc('x')).en).toBeUndefined();
  });

  test('search finds a code by code or by Turkish words', async () => {
    expect((await searchDtc('p0420', 'tr'))[0]?.code).toBe('P0420');
    expect((await searchDtc('ateşleme', 'tr')).map((r) => r.code)).toContain('P0301');
  });
});

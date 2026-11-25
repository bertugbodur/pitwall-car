import { describe, expect, test } from 'vitest';
import { staleKeys } from '../src/lib/freshness.ts';

describe('stale readings', () => {
  test('drive values expire quickly, slow sensors later, voltage included', () => {
    const stamps = { '0C': 0, '0D': 9_000, '2F': 0, RV: 0 };
    expect(staleKeys(stamps, 15_000).sort()).toEqual(['0C']);
    expect(staleKeys(stamps, 25_000).sort()).toEqual(['0C', '0D', '2F', 'RV']);
  });
});

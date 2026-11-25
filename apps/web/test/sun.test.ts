import { describe, expect, test } from 'vitest';
import { isNight, sunTimes } from '../src/lib/sun.ts';

describe('day and night theme', () => {
  test('summer days are long, winter days short at 40° north', () => {
    const summer = sunTimes(new Date(2026, 5, 21), 40);
    const winter = sunTimes(new Date(2026, 11, 21), 40);
    expect(summer.sunset - summer.sunrise).toBeCloseTo(14.8, 0);
    expect(winter.sunset - winter.sunrise).toBeCloseTo(9.2, 0);
  });

  test('night before sunrise and after sunset', () => {
    expect(isNight(new Date(2026, 5, 21, 13, 0), 40)).toBe(false);
    expect(isNight(new Date(2026, 5, 21, 2, 0), 40)).toBe(true);
    expect(isNight(new Date(2026, 11, 21, 18, 30), 40)).toBe(true);
  });
});

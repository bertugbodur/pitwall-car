/**
 * Approximate sunrise and sunset from the date alone, so the day/night theme works
 * without asking for the location. Assumes solar noon near 12:30 local clock time.
 */
const SOLAR_NOON = 12.5;
const DEFAULT_LATITUDE = 40;

export function sunTimes(date: Date, latitude = DEFAULT_LATITUDE): { sunrise: number; sunset: number } {
  const day = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const rad = Math.PI / 180;
  const declination = -23.44 * Math.cos(((360 / 365) * (day + 10)) * rad);
  // -0.83° accounts for refraction and the size of the sun.
  const cosHour =
    (Math.sin(-0.83 * rad) - Math.sin(latitude * rad) * Math.sin(declination * rad)) /
    (Math.cos(latitude * rad) * Math.cos(declination * rad));
  const half = Math.acos(Math.min(1, Math.max(-1, cosHour))) / rad / 15;
  return { sunrise: SOLAR_NOON - half, sunset: SOLAR_NOON + half };
}

export function isNight(now: Date, latitude?: number): boolean {
  const { sunrise, sunset } = sunTimes(now, latitude);
  const hour = now.getHours() + now.getMinutes() / 60;
  return hour < sunrise || hour >= sunset;
}

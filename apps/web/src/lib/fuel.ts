/** Fuel flow estimated from air flow. Method and limits are described in docs/consumption.md. */

export type FuelType = 'petrol' | 'diesel' | 'lpg' | 'ev' | 'hybrid';

export interface FuelProfile {
  fuel: FuelType;
  displacementL?: number;
}

export interface AirReadings {
  maf?: number;
  rpm?: number;
  map?: number;
  iat?: number;
}

/** Air to fuel mass ratio and fuel density in g/L. */
const FUELS: Partial<Record<FuelType, { afr: number; density: number }>> = {
  petrol: { afr: 14.7, density: 745 },
  hybrid: { afr: 14.7, density: 745 },
  diesel: { afr: 14.5, density: 832 },
  lpg: { afr: 15.6, density: 540 },
};

const VOLUMETRIC_EFFICIENCY = 0.8;
const AIR_MOLAR_MASS = 28.97;
const GAS_CONSTANT = 8.314;

export function airFlowGs({ maf, rpm, map, iat }: AirReadings, displacementL?: number): number | undefined {
  if (maf !== undefined) return maf;
  if (rpm === undefined || map === undefined || iat === undefined || !displacementL) return undefined;
  // Four stroke: half the displacement is drawn in per revolution. kPa × L = J.
  const joulesPerSecond = (rpm / 120) * displacementL * map * VOLUMETRIC_EFFICIENCY;
  return (joulesPerSecond * AIR_MOLAR_MASS) / (GAS_CONSTANT * (iat + 273.15));
}

export function fuelRateLh(readings: AirReadings, profile: FuelProfile): number | undefined {
  const fuel = FUELS[profile.fuel];
  const air = airFlowGs(readings, profile.displacementL);
  if (!fuel || air === undefined) return undefined;
  return (air * 3600) / (fuel.afr * fuel.density);
}

/** Per distance consumption is meaningless when (almost) standing still. */
export function litresPer100Km(rateLh: number, speedKmh: number): number | undefined {
  return speedKmh > 5 ? (rateLh / speedKmh) * 100 : undefined;
}

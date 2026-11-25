/** Electric vehicle specifications from OpenEV Data (CDLA-Permissive-2.0). */
export interface EvModel {
  id: string;
  name: string;
  usableKwh: number;
  maxDcKw?: number;
  /** Derived from the rated range; real consumption is usually higher. */
  consumptionWhKm?: number;
}

export const loadEvModels = async (): Promise<EvModel[]> => (await import('../data/vehicles.json')).default as EvModel[];

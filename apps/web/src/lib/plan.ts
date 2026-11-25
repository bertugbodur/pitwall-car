import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PlanStop {
  name: string;
  lon: number;
  lat: number;
  /** Distance from the start along the route. */
  atKm: number;
  chargeToPercent?: number;
  arrivePercent?: number;
  minutes?: number;
}

export interface TripPlan {
  from: string;
  to: string;
  distanceKm: number;
  durationSec: number;
  line: [number, number][];
  stops: PlanStop[];
  /** Odometer reading when the route was planned. */
  startKm?: number;
}

export const usePlan = create<{ plan: TripPlan | undefined }>()(persist(() => ({ plan: undefined as TripPlan | undefined }), { name: 'pitwall-plan' }));

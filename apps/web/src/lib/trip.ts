export interface Trip {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceKm: number;
  avgSpeed: number;
  fuelL?: number;
  avgConsumption?: number;
  idleSec: number;
  maxCoolantC: number;
  /** [longitude, latitude]. Present only when the user switched location recording on. */
  track?: [number, number][];
}

export interface TripSample {
  at: number;
  speed: number;
  rpm: number;
  coolant?: number;
  fuelLh?: number;
}

/** Longer pauses mean the link dropped; nothing is assumed about them. */
const MAX_GAP_SEC = 5;
const MIN_DISTANCE_KM = 0.1;

export class TripRecorder {
  readonly startedAt: number;
  private last: number | undefined;
  private distanceKm = 0;
  private movingSec = 0;
  private idleSec = 0;
  private fuelL: number | undefined;
  private maxCoolantC = 0;
  private track: [number, number][] = [];

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  add(sample: TripSample): void {
    const dt = this.last === undefined ? 0 : (sample.at - this.last) / 1000;
    this.last = sample.at;
    if (sample.coolant !== undefined) this.maxCoolantC = Math.max(this.maxCoolantC, sample.coolant);
    if (dt <= 0 || dt > MAX_GAP_SEC) return;

    this.distanceKm += (sample.speed * dt) / 3600;
    if (sample.speed > 0) this.movingSec += dt;
    else if (sample.rpm > 0) this.idleSec += dt;
    if (sample.fuelLh !== undefined) this.fuelL = (this.fuelL ?? 0) + (sample.fuelLh * dt) / 3600;
  }

  addPosition(longitude: number, latitude: number): void {
    this.track.push([longitude, latitude]);
  }

  clearTrack(): void {
    this.track = [];
  }

  get distance(): number {
    return this.distanceKm;
  }

  finish(endedAt: number): Trip | undefined {
    if (this.distanceKm < MIN_DISTANCE_KM) return undefined;
    const trip: Trip = {
      id: String(this.startedAt),
      startedAt: this.startedAt,
      endedAt,
      distanceKm: this.distanceKm,
      avgSpeed: this.movingSec > 0 ? this.distanceKm / (this.movingSec / 3600) : 0,
      idleSec: Math.round(this.idleSec),
      maxCoolantC: this.maxCoolantC,
    };
    if (this.fuelL !== undefined) {
      trip.fuelL = this.fuelL;
      trip.avgConsumption = (this.fuelL / this.distanceKm) * 100;
    }
    if (this.track.length > 0) trip.track = this.track;
    return trip;
  }
}

/** Distance weighted consumption over recorded trips, in L/100 km. */
export function measuredConsumption(trips: readonly Trip[]): { litresPer100Km: number; distanceKm: number } | undefined {
  const usable = trips.filter((t) => t.fuelL !== undefined);
  const distanceKm = usable.reduce((sum, t) => sum + t.distanceKm, 0);
  if (distanceKm <= 0) return undefined;
  return { litresPer100Km: (usable.reduce((sum, t) => sum + t.fuelL!, 0) / distanceKm) * 100, distanceKm };
}

export const DRIVING_SPEED_KMH = 5;

export interface DriveLock {
  /** Feed the latest speed (undefined when unknown); returns whether the UI must be locked. */
  update(speed: number | undefined, now: number): boolean;
}

/** Locks as soon as the car exceeds 5 km/h, releases after it has stayed slow for a moment. */
export function createDriveLock(releaseMs = 2000): DriveLock {
  let locked = false;
  let slowSince: number | undefined;
  return {
    update(speed, now) {
      if (speed === undefined) {
        locked = false;
        slowSince = undefined;
      } else if (speed > DRIVING_SPEED_KMH) {
        locked = true;
        slowSince = undefined;
      } else if (locked) {
        slowSince ??= now;
        if (now - slowSince >= releaseMs) locked = false;
      }
      return locked;
    },
  };
}

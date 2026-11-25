import { useEffect, useRef } from 'react';

const TIME_CONSTANT_MS = 110;

/**
 * Eases towards each new reading on every animation frame and hands the in-between
 * value to `draw`, which writes to the DOM directly. Honours reduced motion.
 */
export function useSmoothed(target: number | undefined, draw: (value: number | undefined) => void): void {
  const shown = useRef<number | undefined>(undefined);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (target === undefined || shown.current === undefined || reduced) {
      shown.current = target;
      drawRef.current(target);
      return;
    }
    let frame = 0;
    let previous = performance.now();
    const step = (now: number) => {
      const current = shown.current!;
      const next = current + (target - current) * (1 - Math.exp(-Math.max(0, now - previous) / TIME_CONSTANT_MS));
      previous = now;
      const done = Math.abs(target - next) <= Math.max(0.01, Math.abs(target) * 0.002);
      shown.current = done ? target : next;
      drawRef.current(shown.current);
      if (!done) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
}

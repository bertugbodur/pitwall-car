import { useRef } from 'react';
import { useSmoothed } from './useSmoothed.ts';

const SWEEP = 270;
const point = (angle: number, r: number): [number, number] => {
  const radians = (angle * Math.PI) / 180;
  return [100 + r * Math.cos(radians), 100 + r * Math.sin(radians)];
};
const ARC = `M ${point(135, 86).join(' ')} A 86 86 0 1 1 ${point(135 + SWEEP, 86).join(' ')}`;

export interface DialProps {
  value: number | undefined;
  min?: number;
  max: number;
  label: string;
  unit: string;
  /** Value from which the arc turns red. */
  redline?: number;
  digits?: number;
  /** Divides the scale numbers, e.g. 1000 for an rpm dial. */
  tickScale?: number;
  className?: string;
}

export function Dial({ value, min = 0, max, label, unit, redline, digits = 0, tickScale = 1, className }: DialProps) {
  const arc = useRef<SVGPathElement>(null);
  const text = useRef<SVGTextElement>(null);
  const ratio = (v: number) => Math.min(1, Math.max(0, (v - min) / (max - min)));

  // Drawn outside React so the gauge moves at the display refresh rate.
  useSmoothed(value, (shown) => {
    if (arc.current) {
      arc.current.style.strokeDashoffset = String(100 - ratio(shown ?? min) * 100);
      arc.current.style.stroke = redline !== undefined && (shown ?? min) >= redline ? 'var(--danger)' : 'var(--accent)';
    }
    if (text.current) text.current.textContent = shown === undefined ? '–' : shown.toFixed(digits);
  });

  return (
    <svg viewBox="0 0 200 180" className={className} role="img" aria-label={`${label}: ${value?.toFixed(digits) ?? '–'} ${unit}`}>
      <path d={ARC} fill="none" stroke="var(--line)" strokeWidth="12" strokeLinecap="round" />
      <path
        ref={arc}
        d={ARC}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="12"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100 100"
        strokeDashoffset={100}
      />
      {Array.from({ length: 6 }, (_, i) => {
        const [x, y] = point(135 + (SWEEP * i) / 5, 66);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="var(--muted)">
            {Math.round((min + ((max - min) * i) / 5) / tickScale)}
          </text>
        );
      })}
      <text ref={text} x="100" y="108" textAnchor="middle" fontSize="40" fontWeight="700" fill="var(--text)" className="tnum">
        –
      </text>
      <text x="100" y="128" textAnchor="middle" fontSize="12" fill="var(--muted)">{unit}</text>
      <text x="100" y="170" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--muted)">{label}</text>
    </svg>
  );
}

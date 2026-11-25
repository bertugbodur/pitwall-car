import type { BodyStyle } from '../lib/settings.ts';

/** Neutral line art of no particular make. Side view, facing left. */
const BODIES: Record<BodyStyle, { body: string; windows: string[] }> = {
  sedan: {
    body: 'M18 112 C20 96 34 90 62 85 L108 78 C130 56 152 46 190 45 C230 44 254 56 276 76 L322 81 C338 84 342 94 342 112 L338 122 L20 122 Z',
    windows: ['M120 79 C138 61 156 54 184 53 L186 77 Z', 'M194 53 C224 53 244 60 262 76 L196 77 Z'],
  },
  hatchback: {
    body: 'M24 112 C26 96 40 90 66 85 L108 79 C132 55 156 44 200 43 C250 42 292 48 314 80 C324 86 328 96 326 112 L322 122 L28 122 Z',
    windows: ['M122 78 C140 60 160 52 192 51 L194 76 Z', 'M202 51 C246 51 278 56 296 76 L204 77 Z'],
  },
  suv: {
    body: 'M22 112 L24 90 C28 80 44 78 68 76 L106 72 C124 46 146 34 188 33 L292 34 C312 38 322 54 328 72 C336 80 338 94 336 112 L332 122 L26 122 Z',
    windows: ['M118 71 C134 50 150 42 184 41 L186 70 Z', 'M194 41 L246 42 L248 70 L196 70 Z', 'M256 42 L288 43 C300 48 308 60 312 70 L258 70 Z'],
  },
  wagon: {
    body: 'M18 112 C20 96 34 90 62 85 L106 78 C128 56 150 46 188 45 L304 46 C324 52 332 70 336 82 C342 90 342 100 342 112 L338 122 L20 122 Z',
    windows: ['M120 78 C136 61 154 54 182 53 L184 76 Z', 'M192 53 L244 53 L246 76 L194 76 Z', 'M254 53 L298 54 C310 58 316 68 320 76 L256 76 Z'],
  },
};

export function CarSilhouette({ body, className }: { body: BodyStyle; className?: string }) {
  const shape = BODIES[body];
  return (
    <svg viewBox="0 0 360 150" className={className} aria-hidden="true">
      <ellipse cx="180" cy="137" rx="168" ry="7" fill="var(--text)" opacity="0.08" />
      <path d={shape.body} fill="var(--line)" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" />
      {shape.windows.map((d) => (
        <path key={d} d={d} fill="var(--ink)" opacity="0.75" />
      ))}
      <path d="M24 100 L44 97 L42 105 L24 107 Z" fill="var(--raised)" />
      {[92, 276].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="118" r="27" fill="var(--bg)" />
          <circle cx={cx} cy="118" r="22" fill="#24292e" />
          <circle cx={cx} cy="118" r="12" fill="#aeb5bc" />
          <circle cx={cx} cy="118" r="3.5" fill="#24292e" />
        </g>
      ))}
    </svg>
  );
}

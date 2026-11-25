/** A compact value with a bar, for readings that do not need a dial. */
export function Meter({ label, value, unit, min, max, digits = 0 }: {
  label: string;
  value: number | undefined;
  unit: string;
  min: number;
  max: number;
  digits?: number;
}) {
  const ratio = value === undefined ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  return (
    <div className="min-w-0 rounded-md border border-line bg-raised p-4">
      <div className="truncate text-[13px] text-muted">{label}</div>
      <div className="tnum text-2xl font-bold">
        {value === undefined ? '–' : value.toFixed(digits)}
        <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full origin-left bg-accent transition-transform duration-200" style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Sample } from '../lib/store.ts';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function LineChart({ title, unit, samples }: { title: string; unit: string; samples: readonly Sample[] }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | undefined>(undefined);

  useEffect(() => {
    const element = host.current!;
    const axis = { stroke: css('--muted'), grid: { stroke: css('--line'), width: 1 }, ticks: { stroke: css('--line') } };
    chart.current = new uPlot(
      {
        width: element.clientWidth || 300,
        height: 160,
        legend: { show: false },
        cursor: { drag: { x: false, y: false } },
        series: [{}, { label: title, stroke: css('--accent'), width: 2, points: { show: false } }],
        axes: [axis, { ...axis, size: 56 }],
      },
      [[], []],
      element,
    );
    const resize = new ResizeObserver(() => chart.current?.setSize({ width: element.clientWidth, height: 160 }));
    resize.observe(element);
    return () => {
      resize.disconnect();
      chart.current?.destroy();
    };
  }, [title]);

  useEffect(() => {
    chart.current?.setData([samples.map(([at]) => at / 1000), samples.map(([, value]) => value)]);
  }, [samples, title]);

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-1 text-[13px] font-semibold">
        {title} <span className="font-normal text-muted">({unit})</span>
      </figcaption>
      <div ref={host} />
    </figure>
  );
}

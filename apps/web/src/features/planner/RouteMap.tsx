import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import type { PlanStop } from '../../lib/plan.ts';
import { useSettings } from '../../lib/settings.ts';

maplibregl.setWorkerUrl(workerUrl);

const TURKEY: [number, number] = [32.85, 39.5];
const NO_STOPS: PlanStop[] = [];

export default function RouteMap({ line, stops = NO_STOPS, className, interactive = true }: {
  line?: [number, number][];
  stops?: PlanStop[];
  className?: string;
  interactive?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map>();
  const style = useSettings((s) => s.mapStyle);

  useEffect(() => {
    const instance = new maplibregl.Map({
      container: host.current!,
      style,
      center: TURKEY,
      zoom: 4.5,
      interactive,
      // OpenStreetMap attribution must stay visible.
      attributionControl: { compact: false },
    });
    instance.on('load', () => setMap(instance));
    return () => {
      setMap(undefined);
      instance.remove();
    };
  }, [style, interactive]);

  useEffect(() => {
    if (!map) return;
    const markers = stops.map((stop) =>
      new maplibregl.Marker({ color: '#0f7a4f' })
        .setLngLat([stop.lon, stop.lat])
        .setPopup(new maplibregl.Popup().setText(stop.name))
        .addTo(map),
    );
    if (line && line.length > 1) {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0f7a4f', 'line-width': 5 },
      });
      const bounds = line.reduce((all, point) => all.extend(point), new maplibregl.LngLatBounds(line[0], line[0]));
      map.fitBounds(bounds, { padding: 40, duration: 0 });
    }
    return () => {
      markers.forEach((marker) => marker.remove());
      // The map may already have been removed together with its style.
      if (!map.style) return;
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');
    };
  }, [map, line, stops]);

  return <div ref={host} data-testid="map" className={`overflow-hidden rounded-md ${className ?? 'h-96'}`} />;
}

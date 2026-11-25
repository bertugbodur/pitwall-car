import { useEffect, useState } from 'react';
import { Button, Card, Notice, PageTitle } from '../../components/ui.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { deleteTrip, listTrips } from '../../lib/db.ts';
import { dateTime, download, duration, num } from '../../lib/format.ts';
import { useLive } from '../../lib/store.ts';
import type { Trip } from '../../lib/trip.ts';

const useStrings = defineStrings(
  'trips',
  {
    title: 'Yolculuklar',
    subtitle: 'Bağlıyken yaptığın sürüşler otomatik kaydedilir ve bu cihazda kalır.',
    empty: 'Henüz yolculuk yok. Bağlanıp en az 100 m sür; kayıt bağlantı kesilince ya da motor kapanınca saklanır.',
    distance: 'Mesafe',
    time: 'Süre',
    speed: 'Ort. hız',
    consumption: 'Tüketim',
    fuel: 'Yakıt',
    idle: 'Rölanti',
    coolant: 'En yüksek sıcaklık',
    delete: 'Sil',
    confirm: 'Silmeyi onayla',
    export: 'JSON indir',
    route: 'Kaydedilen iz',
  },
  {
    title: 'Trips',
    subtitle: 'Drives made while connected are recorded automatically and stay on this device.',
    empty: 'No trips yet. Connect and drive at least 100 m; the trip is saved when you disconnect or switch the engine off.',
    distance: 'Distance',
    time: 'Duration',
    speed: 'Avg. speed',
    consumption: 'Consumption',
    fuel: 'Fuel',
    idle: 'Idling',
    coolant: 'Peak coolant',
    delete: 'Delete',
    confirm: 'Confirm delete',
    export: 'Download JSON',
    route: 'Recorded track',
  },
);

/** The recorded line drawn on its own, so showing it sends nothing anywhere. */
function Track({ points, label }: { points: [number, number][]; label: string }) {
  const lon = points.map((p) => p[0]);
  const lat = points.map((p) => p[1]);
  const minX = Math.min(...lon);
  const maxY = Math.max(...lat);
  const scale = 100 / Math.max(Math.max(...lon) - minX, maxY - Math.min(...lat), 1e-6);
  const path = points.map(([x, y]) => `${(x - minX) * scale},${(maxY - y) * scale}`).join(' ');
  return (
    <svg viewBox="-5 -5 110 110" className="h-32 w-full" role="img" aria-label={label}>
      <polyline points={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function TripCard({ trip, onDelete }: { trip: Trip; onDelete(): void }) {
  const t = useStrings();
  const language = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const rows = [
    [t('distance'), `${num(trip.distanceKm, language, 1)} km`],
    [t('time'), duration((trip.endedAt - trip.startedAt) / 1000, language)],
    [t('speed'), `${num(trip.avgSpeed, language)} km/h`],
    [t('consumption'), `${num(trip.avgConsumption, language, 1)} L/100 km`],
    [t('fuel'), `${num(trip.fuelL, language, 2)} L`],
    [t('idle'), duration(trip.idleSec, language)],
    [t('coolant'), `${num(trip.maxCoolantC, language)} °C`],
  ];
  return (
    <Card
      title={dateTime(trip.startedAt, language)}
      action={
        <Button
          onClick={() => {
            if (confirming) onDelete();
            else setConfirming(true);
          }}
        >
          {confirming ? t('confirm') : t('delete')}
        </Button>
      }
    >
      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="tnum m-0 text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {trip.track && trip.track.length > 1 && <Track points={trip.track} label={t('route')} />}
    </Card>
  );
}

export function TripsPage() {
  const t = useStrings();
  const status = useLive((s) => s.status);
  const [trips, setTrips] = useState<Trip[]>();
  const refresh = () => void listTrips().then(setTrips);

  // A trip is written when the connection ends, so reload on status changes too.
  useEffect(() => {
    const timer = setTimeout(refresh, 100);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <div className="grid gap-4">
      <PageTitle
        title={t('title')}
        subtitle={t('subtitle')}
        action={
          trips && trips.length > 0 ? (
            <Button onClick={() => download('pitwall-trips.json', 'application/json', JSON.stringify(trips))}>{t('export')}</Button>
          ) : undefined
        }
      />
      {trips?.length === 0 && <Notice>{t('empty')}</Notice>}
      {trips?.map((trip) => (
        <TripCard key={trip.id} trip={trip} onDelete={() => void deleteTrip(trip.id).then(refresh)} />
      ))}
    </div>
  );
}

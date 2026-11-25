import { Link } from '@tanstack/react-router';
import { Fuel, ShieldCheck, TriangleAlert } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { CarSilhouette } from '../../components/CarSilhouette.tsx';
import { Badge, Card, Stat } from '../../components/ui.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { listTrips } from '../../lib/db.ts';
import { num } from '../../lib/format.ts';
import { usePlan } from '../../lib/plan.ts';
import { healthScore } from '../../lib/health.ts';
import { useSettings } from '../../lib/settings.ts';
import { useLive, useValue } from '../../lib/store.ts';
import { measuredConsumption } from '../../lib/trip.ts';
import { ConnectPanel } from '../connect/ConnectPanel.tsx';
import { AssistantCard } from './AssistantCard.tsx';

const RouteMap = lazy(() => import('../planner/RouteMap.tsx'));

const useStrings = defineStrings(
  'home',
  {
    title: 'Aracın bir bakışta',
    subtitle: 'OBD-II verisi, arıza açıklaması ve yolculuk planı',
    offline: 'Araç bağlı değil',
    online: 'Araç bağlı',
    reconnecting: 'Yeniden bağlanıyor',
    demo: 'Simülatör',
    health: 'Araç sağlık skoru',
    consumption: 'Ortalama tüketim',
    trips: 'kayıtlı yolculuklardan',
    session: 'bu bağlantıdan',
    codes: 'Açık arıza',
    speed: 'Hız',
    rpm: 'Devir',
    coolant: 'Motor suyu',
    voltage: 'Akü',
    now: 'Şu an',
    planner: 'Yolculuk planı',
    open: 'Planlayıcıyı aç',
  },
  {
    title: 'Your car at a glance',
    subtitle: 'OBD-II data, fault explanations and trip planning',
    offline: 'Car not connected',
    online: 'Car connected',
    reconnecting: 'Reconnecting',
    demo: 'Simulator',
    health: 'Vehicle health score',
    consumption: 'Average consumption',
    trips: 'from recorded trips',
    session: 'from this session',
    codes: 'Open codes',
    speed: 'Speed',
    rpm: 'Engine speed',
    coolant: 'Coolant',
    voltage: 'Battery',
    now: 'Right now',
    planner: 'Trip plan',
    open: 'Open the planner',
  },
);

function MapCard() {
  const t = useStrings();
  const plan = usePlan((s) => s.plan);
  return (
    <Card
      title={t('planner')}
      subtitle={plan ? `${plan.from} → ${plan.to}` : undefined}
      action={<Link to="/planner" className="font-semibold text-accent-ink">{t('open')}</Link>}
    >
      <Suspense fallback={<div className="h-56 rounded-md bg-raised" />}>
        <RouteMap interactive={false} line={plan?.line} stops={plan?.stops} className="h-56" />
      </Suspense>
    </Card>
  );
}

function Now() {
  const t = useStrings();
  const language = useLanguage();
  const speed = useValue('0D');
  const rpm = useValue('0C');
  const coolant = useValue('05');
  const voltage = useValue('RV');
  const items = [
    [t('speed'), num(speed, language), 'km/h'],
    [t('rpm'), num(rpm, language), 'rpm'],
    [t('coolant'), num(coolant, language), '°C'],
    [t('voltage'), num(voltage, language, 1), 'V'],
  ];
  return (
    <Card title={t('now')}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([label, value, unit]) => (
          <div key={label} className="rounded-md border border-line bg-raised p-4">
            <div className="text-[13px] text-muted">{label}</div>
            <div className="tnum text-2xl font-bold">
              {value} <span className="text-sm font-semibold text-muted">{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function HomePage() {
  const t = useStrings();
  const language = useLanguage();
  const status = useLive((s) => s.status);
  const source = useLive((s) => s.source);
  const dtcs = useLive((s) => s.dtcs);
  const readiness = useLive((s) => s.readiness);
  const usedL = useLive((s) => s.usedL);
  const drivenKm = useLive((s) => s.drivenKm);
  const coolant = useValue('05');
  const profile = useSettings((s) => s.profile);
  const [fromTrips, setFromTrips] = useState<number>();
  const connected = status === 'connected' || status === 'reconnecting';

  useEffect(() => {
    void listTrips().then((trips) => setFromTrips(measuredConsumption(trips)?.litresPer100Km));
  }, [status]);

  const health = healthScore({ dtcs, milOn: readiness?.milOn, coolant });
  const session = drivenKm > 0.05 ? (usedL / drivenKm) * 100 : undefined;
  const codes = dtcs ? new Set(dtcs.map((d) => d.code)).size : undefined;

  return (
    <div className="grid gap-4">
      <section className="grid items-center gap-2 md:grid-cols-[1fr_1.1fr]">
        <div>
          <h1 className="m-0 text-4xl leading-tight font-bold sm:text-5xl">{t('title')}</h1>
          <p className="mt-2 mb-4 text-lg text-muted">{t('subtitle')}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone={status === 'connected' ? 'ok' : status === 'reconnecting' ? 'warn' : 'neutral'}>
              <span className="size-2.5 rounded-full bg-current" aria-hidden="true" />
              {status === 'connected' ? t('online') : status === 'reconnecting' ? t('reconnecting') : t('offline')}
            </Badge>
            {connected && source === 'sim' && <Badge>{t('demo')}</Badge>}
            {profile.name && <Badge>{profile.name}</Badge>}
          </div>
        </div>
        <CarSilhouette body={profile.body} className="w-full max-w-xl justify-self-end" />
      </section>

      <ConnectPanel />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<ShieldCheck />} value={num(health?.score, language)} unit="/100" label={t('health')} tone={health?.level} />
        <Stat
          icon={<Fuel />}
          value={num(fromTrips ?? session, language, 1)}
          unit="L/100 km"
          label={`${t('consumption')} · ${fromTrips === undefined ? t('session') : t('trips')}`}
        />
        <Stat
          icon={<TriangleAlert />}
          value={num(codes, language)}
          label={t('codes')}
          tone={codes === undefined ? undefined : codes === 0 ? 'ok' : dtcs?.some((d) => d.safetyCritical) ? 'danger' : 'warn'}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-4">
          {connected && <Now />}
          <MapCard />
        </div>
        <AssistantCard />
      </div>
    </div>
  );
}

import { Link } from '@tanstack/react-router';
import { Maximize, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { AlertBar } from '../../components/AlertBar.tsx';
import { Dial } from '../../components/gauges/Dial.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { litresPer100Km } from '../../lib/fuel.ts';
import { num } from '../../lib/format.ts';
import { usePlan } from '../../lib/plan.ts';
import { connect } from '../../lib/session.ts';
import { useSettings, type HmiLayout, type Settings } from '../../lib/settings.ts';
import { useLive, useValue } from '../../lib/store.ts';
import { isNight } from '../../lib/sun.ts';
import { SimulatorControls } from '../connect/ConnectPanel.tsx';

const RouteMap = lazy(() => import('../planner/RouteMap.tsx'));

const useStrings = defineStrings(
  'hmi',
  {
    classic: 'Klasik',
    minimal: 'Minimal',
    trip: 'Yolculuk',
    auto: 'Otomatik',
    day: 'Gündüz',
    night: 'Gece',
    speed: 'Hız',
    rpm: 'Devir',
    coolant: 'Motor suyu',
    consumption: 'Tüketim',
    nextStop: 'Sonraki durak',
    arrival: 'Varış',
    noPlan: 'Rota yok. Planlayıcıdan bir rota oluştur.',
    exit: 'Çık',
    fullscreen: 'Tam ekran',
    offline: 'Araç bağlı değil',
    demo: 'Simülatörle dene',
    layout: 'Düzen',
    theme: 'Tema',
  },
  {
    classic: 'Classic',
    minimal: 'Minimal',
    trip: 'Trip',
    auto: 'Auto',
    day: 'Day',
    night: 'Night',
    speed: 'Speed',
    rpm: 'Engine speed',
    coolant: 'Coolant',
    consumption: 'Consumption',
    nextStop: 'Next stop',
    arrival: 'Destination',
    noPlan: 'No route. Create one in the planner.',
    exit: 'Exit',
    fullscreen: 'Full screen',
    offline: 'Car not connected',
    demo: 'Try the simulator',
    layout: 'Layout',
    theme: 'Theme',
  },
);

/** Keeps the screen on while the cockpit is open. */
function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | undefined;
    let active = true;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      const next = await navigator.wakeLock.request('screen').catch(() => undefined);
      if (active) sentinel = next;
      else void next?.release();
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release();
    };
  }, []);
}

function useNight(preference: Settings['hmiTheme']): boolean {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return preference === 'auto' ? isNight(now) : preference === 'night';
}

function Big({ label, value, unit, huge = false }: { label: string; value: string; unit: string; huge?: boolean }) {
  return (
    <div className="min-w-0 text-center">
      <div className="text-lg font-semibold text-muted">{label}</div>
      <div className={`tnum leading-none font-bold ${huge ? 'text-[min(34vw,38vh)]' : 'text-[clamp(2.5rem,6vw,4.5rem)]'}`}>{value}</div>
      <div className="text-lg font-semibold text-muted">{unit}</div>
    </div>
  );
}

function useConsumption() {
  const language = useLanguage();
  const fuelLh = useLive((s) => s.fuelLh);
  const speed = useValue('0D') ?? 0;
  const per100 = fuelLh === undefined ? undefined : litresPer100Km(fuelLh, speed);
  return per100 === undefined
    ? { value: num(fuelLh, language, 1), unit: 'L/h' }
    : { value: num(per100, language, 1), unit: 'L/100 km' };
}

function Classic() {
  const t = useStrings();
  const language = useLanguage();
  const speed = useValue('0D');
  const rpm = useValue('0C');
  const coolant = useValue('05');
  const consumption = useConsumption();
  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 landscape:grid-cols-[1fr_auto_1fr] landscape:grid-rows-1">
      <Dial value={speed} max={240} unit="km/h" label={t('speed')} className="mx-auto h-full max-h-full w-full" />
      <div className="flex justify-center gap-10 landscape:flex-col">
        <Big label={t('coolant')} value={num(coolant, language)} unit="°C" />
        <Big label={t('consumption')} {...consumption} />
      </div>
      <Dial value={rpm} max={7000} redline={6000} tickScale={1000} unit="rpm" label={t('rpm')} className="mx-auto h-full max-h-full w-full" />
    </div>
  );
}

function Minimal() {
  const t = useStrings();
  const language = useLanguage();
  const speed = useValue('0D');
  return (
    <div className="grid h-full place-items-center">
      <Big huge label={t('speed')} value={num(speed, language)} unit="km/h" />
    </div>
  );
}

function TripLayout() {
  const t = useStrings();
  const language = useLanguage();
  const plan = usePlan((s) => s.plan);
  const speed = useValue('0D');
  const odometerKm = useLive((s) => s.odometerKm);
  // A reconnect restarts the odometer below the value stored with the plan.
  const drivenKm = odometerKm >= (plan?.startKm ?? 0) ? odometerKm - (plan?.startKm ?? 0) : odometerKm;
  const consumption = useConsumption();
  const next = plan?.stops.find((stop) => stop.atKm > drivenKm);
  const target = next ?? (plan && { name: plan.to, atKm: plan.distanceKm });
  return (
    <div className="grid h-full grid-rows-2 gap-4 landscape:grid-cols-[1.3fr_1fr] landscape:grid-rows-1">
      <Suspense fallback={<div className="rounded-md bg-surface" />}>
        <RouteMap interactive={false} line={plan?.line} stops={plan?.stops} className="h-full min-h-0" />
      </Suspense>
      <div className="grid content-center gap-4">
        <div className="flex justify-around">
          <Big label={t('speed')} value={num(speed, language)} unit="km/h" />
          <Big label={t('consumption')} {...consumption} />
        </div>
        <div className="rounded-lg bg-surface p-5 text-center">
          {target ? (
            <>
              <div className="text-lg font-semibold text-muted">{next ? t('nextStop') : t('arrival')}</div>
              <div className="truncate text-2xl font-bold">{target.name}</div>
              <div className="tnum text-4xl font-bold">{num(Math.max(0, target.atKm - drivenKm), language)} km</div>
            </>
          ) : (
            <div className="text-lg text-muted">{t('noPlan')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

const LAYOUTS: Record<HmiLayout, () => ReactNode> = { classic: Classic, minimal: Minimal, trip: TripLayout };

const choice = (active: boolean) =>
  `min-h-14 cursor-pointer rounded-md border px-5 text-base font-bold ${
    active ? 'border-transparent bg-accent text-on-accent' : 'border-line bg-surface text-text'
  }`;

export function HmiPage() {
  const t = useStrings();
  const layout = useSettings((s) => s.hmiLayout);
  const theme = useSettings((s) => s.hmiTheme);
  const set = useSettings((s) => s.set);
  const status = useLive((s) => s.status);
  const driving = useLive((s) => s.driving);
  const night = useNight(theme);
  const Layout = LAYOUTS[layout];
  const connected = status === 'connected' || status === 'reconnecting';
  useWakeLock();

  return (
    <main data-theme={night ? 'dark' : 'light'} data-testid="hmi" className="flex h-dvh flex-col gap-3 overflow-hidden bg-bg p-4 text-text">
      <AlertBar large />
      <div className="min-h-0 flex-1">
        {connected ? (
          <Layout />
        ) : (
          <div className="grid h-full place-content-center gap-4 text-center">
            <p className="m-0 text-2xl font-bold">{t('offline')}</p>
            <button
              type="button"
              className={choice(true)}
              disabled={status === 'connecting'}
              onClick={() => void connect('sim')}
            >
              {t('demo')}
            </button>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-2">
        {/* Nothing but the gauges while the car moves; the simulator can still be stopped. */}
        {!driving && (
          <>
            <div role="group" aria-label={t('layout')} className="flex gap-2">
              {(['classic', 'minimal', 'trip'] as const).map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={layout === id}
                  className={choice(layout === id)}
                  onClick={() => set({ hmiLayout: id })}
                >
                  {t(id)}
                </button>
              ))}
            </div>
            <select
              aria-label={t('theme')}
              className={choice(false)}
              value={theme}
              onChange={(e) => set({ hmiTheme: e.target.value as Settings['hmiTheme'] })}
            >
              {(['auto', 'day', 'night'] as const).map((id) => (
                <option key={id} value={id}>{t(id)}</option>
              ))}
            </select>
            <button
              type="button"
              className={choice(false)}
              aria-label={t('fullscreen')}
              onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
            >
              <Maximize aria-hidden="true" />
            </button>
            <Link to="/" aria-label={t('exit')} className={`${choice(false)} grid place-items-center no-underline`}>
              <X aria-hidden="true" />
            </Link>
          </>
        )}
        <SimulatorControls />
      </footer>
    </main>
  );
}

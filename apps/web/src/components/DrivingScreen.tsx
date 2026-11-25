import { Link } from '@tanstack/react-router';
import { defineStrings, useLanguage } from '../i18n/index.ts';
import { num } from '../lib/format.ts';
import { setParked } from '../lib/session.ts';
import { useLive, useValue } from '../lib/store.ts';
import { Button } from './ui.tsx';

const useStrings = defineStrings(
  'driving',
  {
    title: 'Araç hareket halinde',
    locked: 'Menüler ve metin girişi kilitli.',
    rpm: 'Devir',
    coolant: 'Motor suyu',
    cockpit: 'Gösterge moduna geç',
    stopSim: 'Simülatörde aracı durdur',
  },
  {
    title: 'The car is moving',
    locked: 'Menus and text entry are locked.',
    rpm: 'Engine speed',
    coolant: 'Coolant',
    cockpit: 'Open cockpit mode',
    stopSim: 'Stop the simulated car',
  },
);

/** What the app shows instead of its pages while the car moves: large readings only. */
export function DrivingScreen() {
  const t = useStrings();
  const language = useLanguage();
  const source = useLive((s) => s.source);
  const speed = useValue('0D');
  const rpm = useValue('0C');
  const coolant = useValue('05');

  return (
    <main data-testid="driving-lock" className="grid min-h-dvh content-center justify-items-center gap-6 p-4 text-center">
      <p className="m-0 text-lg font-semibold text-muted">
        {t('title')}. {t('locked')}
      </p>
      <div className="tnum text-[min(40vw,14rem)] leading-none font-bold">{num(speed, language)}</div>
      <div className="-mt-6 text-2xl font-semibold text-muted">km/h</div>
      <div className="flex gap-10">
        <div>
          <div className="tnum text-5xl font-bold">{num(rpm, language)}</div>
          <div className="text-muted">{t('rpm')}</div>
        </div>
        <div>
          <div className="tnum text-5xl font-bold">{num(coolant, language)}°</div>
          <div className="text-muted">{t('coolant')}</div>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/hmi" className="inline-flex min-h-16 items-center rounded-md bg-accent px-8 text-lg font-bold text-on-accent no-underline">
          {t('cockpit')}
        </Link>
        {source === 'sim' && (
          <Button className="!min-h-16 !text-base" onClick={() => setParked(true)}>
            {t('stopSim')}
          </Button>
        )}
      </div>
    </main>
  );
}

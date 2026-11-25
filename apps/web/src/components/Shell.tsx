import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Activity, Gauge, Home, MapPinned, Route, Settings as SettingsIcon, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { defineStrings, setLanguage } from '../i18n/index.ts';
import { useSettings } from '../lib/settings.ts';
import { useLive } from '../lib/store.ts';
import { AlertBar } from './AlertBar.tsx';
import { DrivingScreen } from './DrivingScreen.tsx';
import { Button } from './ui.tsx';

const useStrings = defineStrings(
  'shell',
  {
    home: 'Ana sayfa',
    live: 'Canlı',
    codes: 'Arızalar',
    trips: 'Yolculuk',
    planner: 'Rota',
    hmi: 'Gösterge',
    settings: 'Ayarlar',
    nav: 'Ana menü',
    warningTitle: 'Önce güvenlik',
    warning: 'Sürerken telefonla etkileşime girme. Kurulumu araç dururken yap. Araç hareket ederken menüler ve metin girişi kilitlenir.',
    accept: 'Anladım',
  },
  {
    home: 'Home',
    live: 'Live',
    codes: 'Codes',
    trips: 'Trips',
    planner: 'Planner',
    hmi: 'Cockpit',
    settings: 'Settings',
    nav: 'Main menu',
    warningTitle: 'Safety first',
    warning: 'Do not use your phone while driving. Set things up while the car is stopped. Menus and text entry lock while the car moves.',
    accept: 'I understand',
  },
);

const NAV: {
  to: '/' | '/live' | '/codes' | '/trips' | '/planner' | '/hmi' | '/settings';
  key: 'home' | 'live' | 'codes' | 'trips' | 'planner' | 'hmi' | 'settings';
  icon: LucideIcon;
}[] = [
  { to: '/', key: 'home', icon: Home },
  { to: '/live', key: 'live', icon: Activity },
  { to: '/codes', key: 'codes', icon: TriangleAlert },
  { to: '/trips', key: 'trips', icon: Route },
  { to: '/planner', key: 'planner', icon: MapPinned },
  { to: '/hmi', key: 'hmi', icon: Gauge },
  { to: '/settings', key: 'settings', icon: SettingsIcon },
];

/** Applies language and theme preferences to the document. */
function usePreferences(): void {
  const language = useSettings((s) => s.language);
  const theme = useSettings((s) => s.theme);
  useEffect(() => setLanguage(language), [language]);
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'auto' ? (system.matches ? 'dark' : 'light') : theme;
    };
    apply();
    system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [theme]);
}

function SafetyNotice() {
  const t = useStrings();
  const accepted = useSettings((s) => s.safetyAccepted);
  const set = useSettings((s) => s.set);
  if (accepted) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="safety-title" className="max-w-md rounded-lg bg-surface p-6 shadow-card">
        <h2 id="safety-title" className="mt-0 text-2xl font-bold">{t('warningTitle')}</h2>
        <p>{t('warning')}</p>
        <Button variant="primary" className="w-full" autoFocus onClick={() => set({ safetyAccepted: true })}>
          {t('accept')}
        </Button>
      </div>
    </div>
  );
}

export function Shell() {
  const t = useStrings();
  usePreferences();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const driving = useLive((s) => s.driving);

  // The cockpit view is already made for driving and brings its own layout.
  if (path === '/hmi') {
    return (
      <>
        <Outlet />
        <SafetyNotice />
      </>
    );
  }

  if (driving) return <DrivingScreen />;

  return (
    <div className="mx-auto max-w-7xl p-3 pb-24 sm:p-6 md:pl-28">
      <nav
        aria-label={t('nav')}
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-surface p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:inset-x-auto md:top-6 md:bottom-auto md:left-5 md:flex-col md:justify-start md:gap-1 md:rounded-lg md:border md:p-2 md:shadow-card"
      >
        {NAV.map(({ to, key, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-12 min-w-0 flex-1 flex-col md:min-w-14 md:flex-none items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-semibold text-muted no-underline"
            activeProps={{ className: '!text-accent-ink bg-raised' }}
          >
            <Icon size={22} aria-hidden="true" />
            {t(key)}
          </Link>
        ))}
      </nav>
      <main className="grid gap-4">
        <AlertBar />
        <Outlet />
      </main>
      <SafetyNotice />
    </div>
  );
}

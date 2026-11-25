import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Shell } from './components/Shell.tsx';
import { CodesPage } from './features/dtc/CodesPage.tsx';
import { HomePage } from './features/home/HomePage.tsx';
import { HmiPage } from './features/hmi/HmiPage.tsx';
import { TripsPage } from './features/trips/TripsPage.tsx';
import { LivePage } from './features/live/LivePage.tsx';
import { PlannerPage } from './features/planner/PlannerPage.tsx';
import { SettingsPage } from './features/settings/SettingsPage.tsx';

const root = createRootRoute({ component: Shell });

const page = <const T extends string>(path: T, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => root, path, component });

const routeTree = root.addChildren([
  page('/', HomePage),
  page('/live', LivePage),
  page('/codes', CodesPage),
  page('/hmi', HmiPage),
  page('/planner', PlannerPage),
  page('/trips', TripsPage),
  page('/settings', SettingsPage),
]);

// Hash history works on static hosting such as GitHub Pages without rewrites.
export const router = createRouter({ routeTree, history: createHashHistory() });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

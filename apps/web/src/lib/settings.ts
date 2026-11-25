import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScenarioId } from '@pitwall/obd-core/emulator';
import type { Language } from '../i18n/index.ts';
import type { FuelType } from './fuel.ts';

export type BodyStyle = 'sedan' | 'hatchback' | 'suv' | 'wagon';
export type HmiLayout = 'classic' | 'minimal' | 'trip';
export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

export interface VehicleProfile {
  name: string;
  fuel: FuelType;
  body: BodyStyle;
  displacementL?: number;
  /** Shown to an AI model only when the user ticks the box. */
  makeModelYear: string;
  ev?: { usableKwh: number; consumptionWhKm: number; maxDcKw?: number };
}

export interface Settings {
  language: Language;
  theme: 'auto' | 'light' | 'dark';
  hmiTheme: 'auto' | 'day' | 'night';
  hmiLayout: HmiLayout;
  profile: VehicleProfile;
  currency: 'TRY' | 'EUR' | 'USD' | 'GBP';
  fuelPrice: number;
  recordLocation: boolean;
  mapStyle: string;
  /** `ors` for OpenRouteService (hosted or own), `osrm` for a self-hosted OSRM. */
  routeEngine: 'ors' | 'osrm';
  routeUrl: string;
  routeKey: string;
  chargeKey: string;
  aiProvider: AiProviderId;
  aiModels: Partial<Record<AiProviderId, string>>;
  aiKeys: Partial<Record<AiProviderId, string>>;
  ollamaUrl: string;
  bridgeCode: string;
  bridgePort: number;
  baudRate: number;
  scenario: ScenarioId;
  safetyAccepted: boolean;
}

export const DEFAULTS: Settings = {
  language: typeof navigator !== 'undefined' && !navigator.language.startsWith('tr') ? 'en' : 'tr',
  theme: 'light',
  hmiTheme: 'auto',
  hmiLayout: 'classic',
  profile: { name: '', fuel: 'petrol', body: 'hatchback', displacementL: 1.6, makeModelYear: '' },
  currency: 'TRY',
  fuelPrice: 0,
  recordLocation: false,
  mapStyle: 'https://tiles.openfreemap.org/styles/liberty',
  routeEngine: 'ors',
  routeUrl: 'https://api.heigit.org/openrouteservice',
  routeKey: '',
  chargeKey: '',
  aiProvider: 'ollama',
  aiModels: {},
  aiKeys: {},
  ollamaUrl: 'http://localhost:11434',
  bridgeCode: '',
  bridgePort: 35100,
  baudRate: 38400,
  scenario: 'city',
  safetyAccepted: false,
};

interface SettingsStore extends Settings {
  set(patch: Partial<Settings>): void;
  clearKeys(): void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      clearKeys: () => set({ routeKey: '', chargeKey: '', aiKeys: {}, bridgeCode: '' }),
    }),
    { name: 'pitwall-settings', version: 1 },
  ),
);

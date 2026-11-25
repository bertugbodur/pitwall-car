import { useState } from 'react';
import { Button, Card, Field, Input, Notice, PageTitle, Select } from '../../components/ui.tsx';
import { defineStrings, type Language } from '../../i18n/index.ts';
import { DEFAULTS, useSettings, type AiProviderId, type BodyStyle, type Settings } from '../../lib/settings.ts';

const useStrings = defineStrings(
  'settings',
  {
    title: 'Ayarlar',
    general: 'Genel',
    language: 'Dil',
    theme: 'Uygulama teması',
    auto: 'Otomatik',
    light: 'Açık',
    dark: 'Koyu',
    vehicle: 'Aracım',
    name: 'Araç adı',
    body: 'Gövde tipi',
    sedan: 'Sedan',
    hatchback: 'Hatchback',
    suv: 'SUV',
    wagon: 'Station wagon',
    makeModelYear: 'Marka, model, yıl (isteğe bağlı)',
    currency: 'Para birimi',
    fuelPrice: 'Yakıt fiyatı (litre)',
    connection: 'Bağlantı',
    baud: 'Seri port hızı',
    bridgeCode: 'Köprü eşleşme kodu',
    bridgePort: 'Köprü portu',
    recordLocation: 'Yolculuklarda konumu kaydet',
    ai: 'Yapay zekâ (isteğe bağlı)',
    provider: 'Sağlayıcı',
    model: 'Model (boş bırakılırsa varsayılan)',
    key: 'API anahtarı',
    ollamaUrl: 'Ollama adresi',
    services: 'Harita ve rota',
    mapStyle: 'Harita stil adresi',
    routeEngine: 'Rota motoru',
    routeUrl: 'Rota sunucusu adresi',
    routeKey: 'OpenRouteService anahtarı',
    chargeKey: 'Open Charge Map anahtarı',
    keysTitle: 'Anahtarlar',
    keysWarning: 'Anahtarlar yalnızca bu tarayıcıda saklanır ve sadece ilgili servise gönderilir. Bu cihaza erişen herkes onları görebilir.',
    clear: 'Anahtarları sil',
    cleared: 'Anahtarlar silindi.',
  },
  {
    title: 'Settings',
    general: 'General',
    language: 'Language',
    theme: 'App theme',
    auto: 'Automatic',
    light: 'Light',
    dark: 'Dark',
    vehicle: 'My car',
    name: 'Car name',
    body: 'Body style',
    sedan: 'Sedan',
    hatchback: 'Hatchback',
    suv: 'SUV',
    wagon: 'Estate',
    makeModelYear: 'Make, model, year (optional)',
    currency: 'Currency',
    fuelPrice: 'Fuel price (per litre)',
    connection: 'Connection',
    baud: 'Serial baud rate',
    bridgeCode: 'Bridge pairing code',
    bridgePort: 'Bridge port',
    recordLocation: 'Record location in trips',
    ai: 'AI (optional)',
    provider: 'Provider',
    model: 'Model (default when empty)',
    key: 'API key',
    ollamaUrl: 'Ollama address',
    services: 'Map and routing',
    mapStyle: 'Map style URL',
    routeEngine: 'Routing engine',
    routeUrl: 'Routing server address',
    routeKey: 'OpenRouteService key',
    chargeKey: 'Open Charge Map key',
    keysTitle: 'Keys',
    keysWarning: 'Keys are stored only in this browser and sent only to the service they belong to. Anyone with access to this device can read them.',
    clear: 'Delete keys',
    cleared: 'Keys deleted.',
  },
);

type TextKey = 'bridgeCode' | 'ollamaUrl' | 'mapStyle' | 'routeUrl' | 'routeKey' | 'chargeKey';

export function SettingsPage() {
  const t = useStrings();
  const settings = useSettings();
  const { set, profile } = settings;
  const [cleared, setCleared] = useState(false);
  const provider = settings.aiProvider;
  const setProfile = (patch: Partial<Settings['profile']>) => set({ profile: { ...profile, ...patch } });
  const text = (key: TextKey, secret = false) => (
    <Field label={t(key)}>
      <Input
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        spellCheck={false}
        placeholder={DEFAULTS[key]}
        value={settings[key]}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    </Field>
  );

  return (
    <div className="grid gap-4">
      <PageTitle title={t('title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('general')}>
          <div className="grid gap-3">
            <Field label={t('language')}>
              <Select value={settings.language} onChange={(e) => set({ language: e.target.value as Language })}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label={t('theme')}>
              <Select value={settings.theme} onChange={(e) => set({ theme: e.target.value as Settings['theme'] })}>
                {(['light', 'dark', 'auto'] as const).map((v) => (
                  <option key={v} value={v}>{t(v)}</option>
                ))}
              </Select>
            </Field>
            <label className="flex min-h-11 items-center gap-3 text-[14px] font-semibold">
              <input
                type="checkbox"
                className="size-5"
                checked={settings.recordLocation}
                onChange={(e) => set({ recordLocation: e.target.checked })}
              />
              {t('recordLocation')}
            </label>
          </div>
        </Card>

        <Card title={t('vehicle')}>
          <div className="grid gap-3">
            <Field label={t('name')}>
              <Input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} />
            </Field>
            <Field label={t('body')}>
              <Select value={profile.body} onChange={(e) => setProfile({ body: e.target.value as BodyStyle })}>
                {(['sedan', 'hatchback', 'suv', 'wagon'] as const).map((v) => (
                  <option key={v} value={v}>{t(v)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('makeModelYear')}>
              <Input value={profile.makeModelYear} onChange={(e) => setProfile({ makeModelYear: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('currency')}>
                <Select value={settings.currency} onChange={(e) => set({ currency: e.target.value as Settings['currency'] })}>
                  {['TRY', 'EUR', 'USD', 'GBP'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('fuelPrice')}>
                <Input type="number" min="0" step="0.01" value={settings.fuelPrice || ''} onChange={(e) => set({ fuelPrice: Number(e.target.value) })} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title={t('connection')}>
          <div className="grid gap-3">
            <Field label={t('baud')}>
              <Select value={settings.baudRate} onChange={(e) => set({ baudRate: Number(e.target.value) })}>
                {[9600, 38400, 57600, 115200].map((rate) => (
                  <option key={rate}>{rate}</option>
                ))}
              </Select>
            </Field>
            {text('bridgeCode')}
            <Field label={t('bridgePort')}>
              <Input type="number" value={settings.bridgePort} onChange={(e) => set({ bridgePort: Number(e.target.value) })} />
            </Field>
          </div>
        </Card>

        <Card title={t('ai')}>
          <div className="grid gap-3">
            <Field label={t('provider')}>
              <Select value={provider} onChange={(e) => set({ aiProvider: e.target.value as AiProviderId })}>
                <option value="ollama">Ollama</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
              </Select>
            </Field>
            <Field label={t('model')}>
              <Input
                autoComplete="off"
                value={settings.aiModels[provider] ?? ''}
                onChange={(e) => set({ aiModels: { ...settings.aiModels, [provider]: e.target.value } })}
              />
            </Field>
            {provider === 'ollama' ? (
              text('ollamaUrl')
            ) : (
              <Field label={t('key')}>
                <Input
                  type="password"
                  autoComplete="off"
                  value={settings.aiKeys[provider] ?? ''}
                  onChange={(e) => set({ aiKeys: { ...settings.aiKeys, [provider]: e.target.value } })}
                />
              </Field>
            )}
          </div>
        </Card>

        <Card title={t('services')}>
          <div className="grid gap-3">
            {text('mapStyle')}
            <Field label={t('routeEngine')}>
              <Select value={settings.routeEngine} onChange={(e) => set({ routeEngine: e.target.value as Settings['routeEngine'] })}>
                <option value="ors">OpenRouteService</option>
                <option value="osrm">OSRM</option>
              </Select>
            </Field>
            {text('routeUrl')}
            {text('routeKey', true)}
            {text('chargeKey', true)}
          </div>
        </Card>

        <Card title={t('keysTitle')}>
          <div className="grid gap-3">
            <Notice tone="warn">{t('keysWarning')}</Notice>
            <Button
              onClick={() => {
                settings.clearKeys();
                setCleared(true);
              }}
            >
              {t('clear')}
            </Button>
            {cleared && <Notice tone="ok">{t('cleared')}</Notice>}
          </div>
        </Card>
      </div>
    </div>
  );
}

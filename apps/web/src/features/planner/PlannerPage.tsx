import { Link } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { loadEvModels, type EvModel } from '@pitwall/ev-data';
import { Button, Card, Field, Input, Notice, PageTitle, Select } from '../../components/ui.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { cached, listTrips } from '../../lib/db.ts';
import { duration, money, num } from '../../lib/format.ts';
import { usePlan } from '../../lib/plan.ts';
import { buildRoute, fuelCost, planCharging, type ChargePlan, type Route, type Station } from '../../lib/planner.ts';
import { fetchRoute, fetchStations, geocode, HOSTED_ORS, type RoutingOptions } from '../../lib/services.ts';
import { useSettings } from '../../lib/settings.ts';
import { useLive } from '../../lib/store.ts';
import { measuredConsumption } from '../../lib/trip.ts';

const RouteMap = lazy(() => import('./RouteMap.tsx'));

const useStrings = defineStrings(
  'planner',
  {
    title: 'Yolculuk planlayıcı',
    from: 'Nereden',
    to: 'Nereye',
    placeholder: 'Şehir, adres veya “enlem, boylam”',
    plan: 'Planla',
    planning: 'Hesaplanıyor…',
    needRouteKey: 'Rota için Ayarlar’a ücretsiz OpenRouteService anahtarını gir ya da kendi sunucunun adresini seç. Harita anahtarsız çalışır.',
    settings: 'Ayarlar',
    distance: 'Mesafe',
    time: 'Sürüş süresi',
    fuel: 'Yakıt hesabı',
    consumption: 'Tüketim (L/100 km)',
    measured: 'Kayıtlı {{km}} km yolculuktan ölçüldü',
    manual: 'Henüz ölçüm yok; elle gir',
    price: 'Litre fiyatı',
    litres: 'Gereken yakıt',
    cost: 'Tahmini maliyet',
    manualDistance: 'Rota olmadan mesafe (km)',
    ev: 'Elektrikli araç',
    model: 'Araç modeli',
    manualModel: 'Elle gireceğim',
    usable: 'Batarya (kWh)',
    perKm: 'Wh/km',
    maxDc: 'DC güç (kW)',
    start: 'Başlangıç %',
    arrive: 'Varış hedefi %',
    min: 'Alt sınır %',
    startHint: 'Standart OBD-II şarj yüzdesini vermez; aracın ekranından bak.',
    needChargeKey: 'Şarj durakları için Ayarlar’a Open Charge Map anahtarını gir.',
    stops: 'Şarj durakları',
    noStops: 'Şarj durağı gerekmiyor.',
    stopLine: '{{km}}. km · {{kw}} kW · %{{from}} → %{{to}} · yaklaşık {{time}}',
    arrival: 'Varışta kalan şarj',
    total: 'Toplam şarj süresi',
    unreachable: 'Bu ayarlarla yaklaşık {{km}}. km’den sonrası için uygun hızlı şarj bulunamadı.',
    limits: 'Sade model: sabit ortalama tüketim, hız ve eğim için basit düzeltme, şarj eğrisi yerine soket gücünün %80’i. Gerçek değerler hava, trafik ve istasyon durumuna göre değişir.',
    data: 'Şarj istasyonu verisi',
    approx: 'Katalog tüketimi menzil değerinden hesaplanır; gerçek tüketim genellikle daha yüksektir.',
  },
  {
    title: 'Trip planner',
    from: 'From',
    to: 'To',
    placeholder: 'City, address or “latitude, longitude”',
    plan: 'Plan',
    planning: 'Calculating…',
    needRouteKey: 'For routing, enter your free OpenRouteService key in Settings or point to your own server. The map works without a key.',
    settings: 'Settings',
    distance: 'Distance',
    time: 'Driving time',
    fuel: 'Fuel estimate',
    consumption: 'Consumption (L/100 km)',
    measured: 'Measured over {{km}} km of recorded trips',
    manual: 'No measurement yet; enter it',
    price: 'Price per litre',
    litres: 'Fuel needed',
    cost: 'Estimated cost',
    manualDistance: 'Distance without a route (km)',
    ev: 'Electric car',
    model: 'Car model',
    manualModel: 'Enter manually',
    usable: 'Battery (kWh)',
    perKm: 'Wh/km',
    maxDc: 'DC power (kW)',
    start: 'Start %',
    arrive: 'Arrival target %',
    min: 'Floor %',
    startHint: 'Standard OBD-II does not report state of charge; read it from the car.',
    needChargeKey: 'For charging stops, enter your Open Charge Map key in Settings.',
    stops: 'Charging stops',
    noStops: 'No charging stop needed.',
    stopLine: 'km {{km}} · {{kw}} kW · {{from}}% → {{to}}% · about {{time}}',
    arrival: 'Charge left on arrival',
    total: 'Total charging time',
    unreachable: 'With these settings no suitable fast charger was found beyond about km {{km}}.',
    limits: 'Simple model: constant average consumption, a basic speed and elevation correction, and 80% of socket power instead of a charging curve. Weather, traffic and station availability change the real numbers.',
    data: 'Charging data',
    approx: 'Catalogue consumption is derived from rated range; real consumption is usually higher.',
  },
);

const DAY = 24 * 3600 * 1000;
const DEFAULT_EV = { usableKwh: 60, consumptionWhKm: 180, maxDcKw: 100 };

interface Planned {
  route: Route;
  charging?: ChargePlan;
  providers: string[];
}

export function PlannerPage() {
  const t = useStrings();
  const language = useLanguage();
  const settings = useSettings();
  const { profile, set } = settings;
  const saved = usePlan((s) => s.plan);
  const isEv = profile.fuel === 'ev';
  const ev = profile.ev ?? DEFAULT_EV;

  const [from, setFrom] = useState(saved?.from ?? '');
  const [to, setTo] = useState(saved?.to ?? '');
  const [limits, setLimits] = useState({ startPercent: 90, arrivePercent: 20, minPercent: 10 });
  const [planned, setPlanned] = useState<Planned>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [models, setModels] = useState<EvModel[]>([]);
  const [measured, setMeasured] = useState<{ litresPer100Km: number; distanceKm: number }>();
  const [consumption, setConsumption] = useState<number>();
  const [manualKm, setManualKm] = useState<number>();

  useEffect(() => {
    void listTrips().then((trips) => setMeasured(measuredConsumption(trips)));
  }, []);
  useEffect(() => {
    if (isEv) void loadEvModels().then(setModels);
  }, [isEv]);

  const routing: RoutingOptions = { engine: settings.routeEngine, url: settings.routeUrl, key: settings.routeKey };
  const needsKey = settings.routeEngine === 'ors' && settings.routeUrl === HOSTED_ORS && !settings.routeKey;
  const per100 = consumption ?? measured?.litresPer100Km;
  const distanceKm = planned?.route.distanceKm ?? manualKm ?? saved?.distanceKm;
  const estimate = !isEv && distanceKm && per100 ? fuelCost(distanceKm, per100, settings.fuelPrice) : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const start = await geocode(from, routing);
      const end = await geocode(to, routing);
      // The same request within a day is answered from this device.
      const key = `${routing.url}:${start.point}:${end.point}`;
      const raw = await cached(`route:${key}`, DAY, async () => {
        const { points, durationSec, distanceKm } = await fetchRoute([start.point, end.point], routing);
        return { points, durationSec, distanceKm };
      });
      const route = buildRoute(raw.points, raw.durationSec, raw.distanceKm);

      let charging: ChargePlan | undefined;
      let stations: Station[] = [];
      if (isEv && settings.chargeKey) {
        stations = await cached(`chargers:${key}`, DAY, () => fetchStations(route, settings.chargeKey));
        charging = planCharging(route, ev, limits, stations);
      }
      setPlanned({ route, charging, providers: [...new Set(stations.flatMap((s) => (s.provider ? [s.provider] : [])))] });
      usePlan.setState({
        plan: {
          from,
          to,
          distanceKm: route.distanceKm,
          durationSec: route.durationSec,
          line: route.line,
          stops: charging?.ok ? charging.stops : [],
          startKm: useLive.getState().odometerKm,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const evNumber = (key: keyof typeof DEFAULT_EV, label: string) => (
    <Field label={label}>
      <Input
        type="number"
        min="1"
        value={ev[key] ?? ''}
        onChange={(e) => set({ profile: { ...profile, ev: { ...ev, [key]: Number(e.target.value) } } })}
      />
    </Field>
  );
  const limit = (key: keyof typeof limits, label: string) => (
    <Field label={label}>
      <Input type="number" min="0" max="100" value={limits[key]} onChange={(e) => setLimits({ ...limits, [key]: Number(e.target.value) })} />
    </Field>
  );
  const plan = planned?.charging;

  return (
    <div className="grid gap-4">
      <PageTitle title={t('title')} />
      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Card>
            <form className="grid gap-3" onSubmit={(e) => void submit(e)}>
              <Field label={t('from')}>
                <Input required placeholder={t('placeholder')} value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label={t('to')}>
                <Input required placeholder={t('placeholder')} value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              <label className="flex min-h-11 items-center gap-3 text-[14px] font-semibold">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={isEv}
                  onChange={(e) => set({ profile: { ...profile, fuel: e.target.checked ? 'ev' : 'petrol', ev } })}
                />
                {t('ev')}
              </label>
              {isEv && (
                <>
                  <Field label={t('model')} hint={t('approx')}>
                    <Select
                      value=""
                      onChange={(e) => {
                        const model = models.find((m) => m.id === e.target.value);
                        if (!model) return;
                        const next = {
                          usableKwh: model.usableKwh,
                          consumptionWhKm: model.consumptionWhKm ?? ev.consumptionWhKm,
                          maxDcKw: model.maxDcKw ?? ev.maxDcKw,
                        };
                        set({ profile: { ...profile, name: model.name, ev: next } });
                      }}
                    >
                      <option value="">{profile.name || t('manualModel')}</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    {evNumber('usableKwh', t('usable'))}
                    {evNumber('consumptionWhKm', t('perKm'))}
                    {evNumber('maxDcKw', t('maxDc'))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {limit('startPercent', t('start'))}
                    {limit('arrivePercent', t('arrive'))}
                    {limit('minPercent', t('min'))}
                  </div>
                  <p className="m-0 text-xs text-muted">{t('startHint')}</p>
                </>
              )}
              <Button type="submit" variant="primary" disabled={busy || needsKey}>
                {busy ? t('planning') : t('plan')}
              </Button>
              {needsKey && (
                <Notice>
                  {t('needRouteKey')} <Link to="/settings" className="text-accent-ink">{t('settings')}</Link>
                </Notice>
              )}
              {isEv && !settings.chargeKey && <Notice>{t('needChargeKey')}</Notice>}
              {error && <Notice tone="danger">{error}</Notice>}
            </form>
          </Card>

          {!isEv && (
            <Card title={t('fuel')}>
              <div className="grid gap-3">
                {!planned && (
                  <Field label={t('manualDistance')}>
                    <Input type="number" min="0" value={manualKm ?? ''} onChange={(e) => setManualKm(Number(e.target.value) || undefined)} />
                  </Field>
                )}
                <Field label={t('consumption')} hint={measured ? t('measured', { km: Math.round(measured.distanceKm) }) : t('manual')}>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={consumption ?? (measured ? Number(measured.litresPer100Km.toFixed(1)) : '')}
                    onChange={(e) => setConsumption(Number(e.target.value) || undefined)}
                  />
                </Field>
                <Field label={`${t('price')} (${settings.currency})`}>
                  <Input type="number" min="0" step="0.01" value={settings.fuelPrice || ''} onChange={(e) => set({ fuelPrice: Number(e.target.value) })} />
                </Field>
                {estimate && (
                  <dl className="m-0 grid grid-cols-2 gap-2" data-testid="fuel-estimate">
                    <div>
                      <dt className="text-[13px] text-muted">{t('litres')}</dt>
                      <dd className="tnum m-0 text-2xl font-bold">{num(estimate.litres, language, 1)} L</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted">{t('cost')}</dt>
                      <dd className="tnum m-0 text-2xl font-bold">
                        {settings.fuelPrice > 0 ? money(estimate.cost, settings.currency, language) : '–'}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <Suspense fallback={<div className="h-96 rounded-md bg-raised" />}>
              <RouteMap line={saved?.line} stops={saved?.stops} className="h-96 lg:h-[32rem]" />
            </Suspense>
            {saved && (
              <p className="tnum mb-0 text-lg font-bold" data-testid="route-summary">
                {saved.from} → {saved.to} · {t('distance')}: {num(saved.distanceKm, language)} km · {t('time')}:{' '}
                {duration(saved.durationSec, language)}
              </p>
            )}
          </Card>
          {plan && (
            <Card title={t('stops')}>
              {!plan.ok && <Notice tone="warn">{t('unreachable', { km: Math.round(plan.reachKm) })}</Notice>}
              {plan.ok && plan.stops.length === 0 && <Notice tone="ok">{t('noStops')}</Notice>}
              {plan.ok && (
                <>
                  <ol className="m-0 grid gap-2 pl-5" data-testid="charge-stops">
                    {plan.stops.map((stop) => (
                      <li key={`${stop.name}-${stop.atKm}`}>
                        <strong>{stop.name}</strong>
                        <div className="tnum text-[13px] text-muted">
                          {t('stopLine', {
                            km: Math.round(stop.atKm),
                            kw: Math.round(stop.kw),
                            from: Math.round(stop.arrivePercent),
                            to: Math.round(stop.chargeToPercent),
                            time: duration(stop.minutes * 60, language),
                          })}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className="tnum mb-0 font-semibold">
                    {t('arrival')}: %{Math.round(plan.arrivePercent)} · {t('total')}:{' '}
                    {duration(plan.stops.reduce((sum, s) => sum + s.minutes * 60, 0), language)}
                  </p>
                </>
              )}
              <p className="mb-0 text-xs text-muted">{t('limits')}</p>
              {planned && planned.providers.length > 0 && (
                <p className="mb-0 text-xs text-muted">
                  {t('data')}: {planned.providers.join('; ')}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

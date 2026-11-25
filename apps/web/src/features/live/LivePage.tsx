import { useState } from 'react';
import { decodeWmi, getPid, maskVin, VOLTAGE_ID } from '@pitwall/obd-core';
import { Dial } from '../../components/gauges/Dial.tsx';
import { Meter } from '../../components/gauges/Meter.tsx';
import { LineChart } from '../../components/LineChart.tsx';
import { Badge, Button, Card, Field, Input, PageTitle, Select } from '../../components/ui.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { litresPer100Km } from '../../lib/fuel.ts';
import { download, num } from '../../lib/format.ts';
import { recordedRows, startRecording, stopRecording, useRecorder } from '../../lib/recorder.ts';
import { useSettings } from '../../lib/settings.ts';
import { useLive, useValue } from '../../lib/store.ts';
import { ConnectPanel } from '../connect/ConnectPanel.tsx';

const useStrings = defineStrings(
  'live',
  {
    title: 'Canlı panel',
    speed: 'Hız',
    rpm: 'Devir',
    coolant: 'Motor suyu',
    voltage: 'Akü voltajı',
    consumption: 'Yakıt tüketimi',
    consumptionHint: 'Hava debisinden hesaplanan tahmin.',
    instantRate: 'Anlık debi',
    instant: 'Anlık tüketim',
    average: 'Ortalama (bu bağlantı)',
    noEstimate: 'Hesap için MAF veya MAP sensörü ve motor hacmi gerekir.',
    sensors: 'Sensörler',
    charts: 'Grafikler',
    addChart: 'Grafik ekle',
    remove: 'Kaldır',
    record: 'Kaydı başlat',
    stop: 'Kaydı durdur ({{count}})',
    csv: 'CSV indir',
    json: 'JSON indir',
    vehicle: 'Araç bilgisi',
    vin: 'Şasi no (VIN)',
    showVin: 'Göster',
    hideVin: 'Gizle',
    maker: 'Üretici',
    protocol: 'Protokol',
    adapter: 'Adaptör',
    supported: 'Desteklenen PID',
    unknown: 'Bilinmiyor',
    profile: 'Yakıt türü',
    displacement: 'Motor hacmi (L)',
    petrol: 'Benzin',
    diesel: 'Dizel',
    lpg: 'LPG',
    hybrid: 'Hibrit',
    ev: 'Elektrik',
  },
  {
    title: 'Live dashboard',
    speed: 'Speed',
    rpm: 'Engine speed',
    coolant: 'Coolant',
    voltage: 'Battery voltage',
    consumption: 'Fuel consumption',
    consumptionHint: 'Estimate calculated from air flow.',
    instantRate: 'Current flow',
    instant: 'Current consumption',
    average: 'Average (this session)',
    noEstimate: 'An estimate needs a MAF or MAP sensor and the engine size.',
    sensors: 'Sensors',
    charts: 'Charts',
    addChart: 'Add chart',
    remove: 'Remove',
    record: 'Start recording',
    stop: 'Stop recording ({{count}})',
    csv: 'Download CSV',
    json: 'Download JSON',
    vehicle: 'Vehicle information',
    vin: 'VIN',
    showVin: 'Show',
    hideVin: 'Hide',
    maker: 'Manufacturer',
    protocol: 'Protocol',
    adapter: 'Adapter',
    supported: 'Supported PIDs',
    unknown: 'Unknown',
    profile: 'Fuel type',
    displacement: 'Engine size (L)',
    petrol: 'Petrol',
    diesel: 'Diesel',
    lpg: 'LPG',
    hybrid: 'Hybrid',
    ev: 'Electric',
  },
);

/** Shown as large dials; everything else the car supports goes into the sensor grid. */
const ON_DIALS = new Set(['0C', '0D', '05']);

function Dials() {
  const t = useStrings();
  const speed = useValue('0D');
  const rpm = useValue('0C');
  const coolant = useValue('05');
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Dial value={speed} max={240} unit="km/h" label={t('speed')} className="mx-auto w-full max-w-72" />
      <Dial value={rpm} max={7000} redline={6000} tickScale={1000} unit="rpm" label={t('rpm')} className="mx-auto w-full max-w-72" />
      <Dial value={coolant} min={40} max={130} redline={110} unit="°C" label={t('coolant')} className="mx-auto w-full max-w-72" />
    </div>
  );
}

function Consumption() {
  const t = useStrings();
  const language = useLanguage();
  const fuelLh = useLive((s) => s.fuelLh);
  const usedL = useLive((s) => s.usedL);
  const drivenKm = useLive((s) => s.drivenKm);
  const speed = useValue('0D') ?? 0;
  const profile = useSettings((s) => s.profile);
  const set = useSettings((s) => s.set);
  const per100 = fuelLh === undefined ? undefined : litresPer100Km(fuelLh, speed);
  const average = drivenKm > 0.05 ? (usedL / drivenKm) * 100 : undefined;
  const rows = [
    [t('instantRate'), num(fuelLh, language, 1), 'L/h'],
    [t('instant'), num(per100, language, 1), 'L/100 km'],
    [t('average'), num(average, language, 1), 'L/100 km'],
  ];
  return (
    <Card title={t('consumption')} subtitle={t('consumptionHint')}>
      <dl className="m-0 grid gap-3 sm:grid-cols-3">
        {rows.map(([label, value, unit]) => (
          <div key={label}>
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="tnum m-0 text-2xl font-bold">
              {value} <span className="text-sm text-muted">{unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      {fuelLh === undefined && <p className="mb-0 text-[13px] text-muted">{t('noEstimate')}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label={t('profile')}>
          <Select value={profile.fuel} onChange={(e) => set({ profile: { ...profile, fuel: e.target.value as typeof profile.fuel } })}>
            {(['petrol', 'diesel', 'lpg', 'hybrid', 'ev'] as const).map((fuel) => (
              <option key={fuel} value={fuel}>{t(fuel)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('displacement')}>
          <Input
            type="number"
            min="0.5"
            max="8"
            step="0.1"
            value={profile.displacementL ?? ''}
            onChange={(e) => set({ profile: { ...profile, displacementL: Number(e.target.value) || undefined } })}
          />
        </Field>
      </div>
    </Card>
  );
}

function Charts() {
  const t = useStrings();
  const language = useLanguage();
  const history = useLive((s) => s.history);
  const [selected, setSelected] = useState(['0C', '0D']);
  const recording = useRecorder((s) => s.recording);
  const count = useRecorder((s) => s.count);

  const label = (pid: string) => (pid === VOLTAGE_ID ? t('voltage') : (getPid(pid)?.name[language] ?? pid));
  const csv = () =>
    [
      'time,pid,name,value,unit',
      ...recordedRows().map((r) => `${new Date(r.at).toISOString()},${r.pid},"${r.name}",${r.value},${r.unit}`),
    ].join('\n');

  return (
    <Card title={t('charts')}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label={t('addChart')}
          className="!w-auto"
          value=""
          onChange={(e) => e.target.value && setSelected((list) => [...list, e.target.value])}
        >
          <option value="">{t('addChart')}</option>
          {Object.keys(history)
            .filter((pid) => !selected.includes(pid))
            .sort()
            .map((pid) => (
              <option key={pid} value={pid}>{label(pid)}</option>
            ))}
        </Select>
        <Button
          variant={recording ? 'ink' : 'secondary'}
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? t('stop', { count }) : t('record')}
        </Button>
        {!recording && count > 0 && (
          <>
            <Button onClick={() => download('pitwall-car.csv', 'text/csv', csv())}>{t('csv')}</Button>
            <Button onClick={() => download('pitwall-car.json', 'application/json', JSON.stringify(recordedRows()))}>{t('json')}</Button>
          </>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {selected.map((pid) => (
          <div key={pid} className="min-w-0">
            <LineChart title={label(pid)} unit={pid === VOLTAGE_ID ? 'V' : (getPid(pid)?.unit ?? '')} samples={history[pid] ?? []} />
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-1 text-xs text-muted"
              onClick={() => setSelected((list) => list.filter((p) => p !== pid))}
            >
              {t('remove')}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function VehicleInfo() {
  const t = useStrings();
  const info = useLive((s) => s.info);
  const vin = useLive((s) => s.vin);
  const [shown, setShown] = useState(false);
  if (!info) return null;
  const rows: [string, string][] = [
    [t('maker'), (vin && decodeWmi(vin)) || t('unknown')],
    [t('protocol'), info.protocolName],
    [t('adapter'), info.adapter],
  ];
  return (
    <Card title={t('vehicle')}>
      <dl className="m-0 grid gap-2 text-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-muted">{t('vin')}</dt>
          <dd className="m-0 flex flex-wrap items-center gap-2 font-semibold">
            <span className="tnum break-all">{vin ? (shown ? vin : maskVin(vin)) : t('unknown')}</span>
            {vin && <Button onClick={() => setShown(!shown)}>{shown ? t('hideVin') : t('showVin')}</Button>}
          </dd>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-1 text-[13px] text-muted">
        {t('supported')} ({info.supportedPids.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {info.supportedPids.map((pid) => (
          <Badge key={pid}>{pid}</Badge>
        ))}
      </div>
    </Card>
  );
}

function Sensors() {
  const t = useStrings();
  const language = useLanguage();
  const values = useLive((s) => s.values);
  const pids = Object.keys(values).filter((pid) => !ON_DIALS.has(pid)).sort();
  return (
    <Card title={t('sensors')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {pids.map((pid) => {
          const def = getPid(pid);
          const unit = def?.unit ?? 'V';
          return (
            <Meter
              key={pid}
              label={def ? def.name[language] : t('voltage')}
              value={values[pid]}
              unit={unit}
              min={def?.min ?? 8}
              max={def?.max ?? 16}
              digits={unit === 'V' ? 2 : ['g/s', 'L/h', '%'].includes(unit) ? 1 : 0}
            />
          );
        })}
      </div>
    </Card>
  );
}

export function LivePage() {
  const t = useStrings();
  const status = useLive((s) => s.status);
  const connected = status === 'connected' || status === 'reconnecting';

  return (
    <div className="grid gap-4">
      <PageTitle title={t('title')} action={connected ? <ConnectPanel /> : undefined} />
      {!connected && <ConnectPanel />}
      {connected && (
        <>
          <Card>
            <Dials />
          </Card>
          <Consumption />
          <Sensors />
          <Charts />
          <VehicleInfo />
        </>
      )}
    </div>
  );
}

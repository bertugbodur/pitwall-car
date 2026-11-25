import { Bluetooth, Cable, Gamepad2, Wifi } from 'lucide-react';
import { SCENARIOS, type ScenarioId } from '@pitwall/obd-core/emulator';
import { transportSupport } from '@pitwall/transports';
import { Button, Card, Notice, Select } from '../../components/ui.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { connect, disconnect, setParked, setScenario } from '../../lib/session.ts';
import { useSettings } from '../../lib/settings.ts';
import { useLive } from '../../lib/store.ts';

const useStrings = defineStrings(
  'connect',
  {
    title: 'Araca bağlan',
    subtitle: 'Kontağı aç, adaptörü tak, bağlantı türünü seç.',
    sim: 'Simülatörle dene',
    serial: 'USB / Bluetooth (seri)',
    ble: 'Bluetooth LE',
    bridge: 'Wi-Fi (yerel köprü)',
    noSupport: 'Bu tarayıcı araç adaptörüne bağlanamıyor. Chrome veya Edge kullan (masaüstü ya da Android) veya simülatörle dene. iPhone ve iPad’de adaptör bağlantısı yoktur.',
    noSerial: 'Bu tarayıcıda seri port bağlantısı yok; Bluetooth LE veya simülatörü kullan.',
    needCode: 'Wi-Fi için önce Ayarlar’a köprünün eşleşme kodunu gir. Köprü: npx pitwall-car bridge',
    connecting: 'Bağlanıyor…',
    failed: 'Bağlanılamadı: {{error}}',
    disconnect: 'Bağlantıyı kes',
    scenario: 'Senaryo',
    drive: 'Sürüşü başlat',
    park: 'Aracı durdur',
    readonly: 'pitwall car yalnızca okur; araca hiçbir şey yazmaz.',
  },
  {
    title: 'Connect to the car',
    subtitle: 'Switch the ignition on, plug in the adapter, pick how it connects.',
    sim: 'Try the simulator',
    serial: 'USB / Bluetooth (serial)',
    ble: 'Bluetooth LE',
    bridge: 'Wi-Fi (local bridge)',
    noSupport: 'This browser cannot talk to a car adapter. Use Chrome or Edge (desktop or Android) or try the simulator. iPhone and iPad cannot connect to adapters.',
    noSerial: 'This browser has no serial port access; use Bluetooth LE or the simulator.',
    needCode: 'For Wi-Fi, enter the bridge pairing code in Settings first. Bridge: npx pitwall-car bridge',
    connecting: 'Connecting…',
    failed: 'Could not connect: {{error}}',
    disconnect: 'Disconnect',
    scenario: 'Scenario',
    drive: 'Start driving',
    park: 'Stop the car',
    readonly: 'pitwall car only reads; it never writes anything to the car.',
  },
);

export function SimulatorControls() {
  const t = useStrings();
  const language = useLanguage();
  const scenario = useSettings((s) => s.scenario);
  const parked = useLive((s) => s.parked);
  const source = useLive((s) => s.source);
  if (source !== 'sim') return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label={t('scenario')} className="!w-auto" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>{s.name[language]}</option>
        ))}
      </Select>
      <Button onClick={() => setParked(!parked)}>{parked ? t('drive') : t('park')}</Button>
    </div>
  );
}

export function ConnectPanel() {
  const t = useStrings();
  const status = useLive((s) => s.status);
  const error = useLive((s) => s.error);
  const bridgeCode = useSettings((s) => s.bridgeCode);
  const support = transportSupport();
  const busy = status === 'connecting';

  if (status === 'connected' || status === 'reconnecting') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <SimulatorControls />
        <Button onClick={() => void disconnect()}>{t('disconnect')}</Button>
      </div>
    );
  }

  return (
    <Card title={t('title')} subtitle={t('subtitle')}>
      <div className="grid gap-3">
        {!support.serial && !support.bluetooth && <Notice tone="warn">{t('noSupport')}</Notice>}
        {!support.serial && support.bluetooth && <Notice>{t('noSerial')}</Notice>}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="primary" disabled={busy} onClick={() => void connect('sim')}>
            <Gamepad2 size={18} aria-hidden="true" /> {t('sim')}
          </Button>
          <Button disabled={busy || !support.serial} onClick={() => void connect('serial')}>
            <Cable size={18} aria-hidden="true" /> {t('serial')}
          </Button>
          <Button disabled={busy || !support.bluetooth} onClick={() => void connect('ble')}>
            <Bluetooth size={18} aria-hidden="true" /> {t('ble')}
          </Button>
          <Button disabled={busy || !bridgeCode} onClick={() => void connect('bridge')}>
            <Wifi size={18} aria-hidden="true" /> {t('bridge')}
          </Button>
        </div>
        {!bridgeCode && <p className="m-0 text-xs text-muted">{t('needCode')}</p>}
        {busy && <Notice>{t('connecting')}</Notice>}
        {status === 'error' && <Notice tone="danger">{t('failed', { error: error ?? '' })}</Notice>}
        <p className="m-0 text-xs text-muted">{t('readonly')}</p>
      </div>
    </Card>
  );
}

import { OctagonAlert, TriangleAlert } from 'lucide-react';
import { defineStrings } from '../i18n/index.ts';
import { activeAlerts, type Alert } from '../lib/alerts.ts';
import { acknowledgeCodes } from '../lib/session.ts';
import { useLive, useValue } from '../lib/store.ts';

const useStrings = defineStrings(
  'alerts',
  {
    overheat: 'Motor aşırı ısınıyor. Güvenli bir yerde durup motoru kapat.',
    lowVoltage: 'Akü voltajı düşük',
    newCode: 'Yeni arıza kodu',
    newCodeDanger: 'Güvenlikle ilgili arıza. Güvenli bir yerde dur, servise başvur.',
    lowFuel: 'Yakıt azaldı',
    ok: 'Tamam',
  },
  {
    overheat: 'Engine overheating. Stop somewhere safe and switch off.',
    lowVoltage: 'Low battery voltage',
    newCode: 'New trouble code',
    newCodeDanger: 'Safety related fault. Stop somewhere safe and contact a garage.',
    lowFuel: 'Low fuel',
    ok: 'OK',
  },
);

export function useAlerts(): Alert[] {
  const coolant = useValue('05');
  const voltage = useValue('RV');
  const rpm = useValue('0C');
  const fuelLevel = useValue('2F');
  const newCodes = useLive((s) => s.newCodes);
  return activeAlerts({ coolant, voltage, rpm, fuelLevel, newCodes });
}

export function AlertBar({ large = false }: { large?: boolean }) {
  const t = useStrings();
  const alerts = useAlerts();
  const driving = useLive((s) => s.driving);
  if (alerts.length === 0) return null;
  return (
    <div className="grid gap-2" aria-live="assertive">
      {alerts.map((alert) => {
        const danger = alert.level === 'danger';
        const Icon = danger ? OctagonAlert : TriangleAlert;
        const label = alert.id === 'newCode' && danger ? t('newCodeDanger') : t(alert.id);
        return (
          <div
            key={alert.id}
            role="alert"
            data-testid={`alert-${alert.id}`}
            className={`alert-in flex items-center gap-3 rounded-md px-4 font-bold ${large ? 'py-4 text-xl' : 'py-3 text-[14px]'} ${
              danger ? 'bg-danger text-on-danger' : 'bg-warn-soft text-warn-ink'
            }`}
          >
            <Icon size={large ? 32 : 20} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {label} <span className="tnum opacity-90">{alert.detail}</span>
            </span>
            {alert.id === 'newCode' && !driving && (
              <button
                type="button"
                className="min-h-11 cursor-pointer rounded-sm border border-current bg-transparent px-4 font-bold text-inherit"
                onClick={acknowledgeCodes}
              >
                {t('ok')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

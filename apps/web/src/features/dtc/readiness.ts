import type { Readiness } from '@pitwall/obd-core';
import type { Language } from '../../i18n/index.ts';

export const MONITOR_NAMES: Record<string, { tr: string; en: string }> = {
  misfire: { tr: 'Ateşleme kaçağı', en: 'Misfire' },
  fuelSystem: { tr: 'Yakıt sistemi', en: 'Fuel system' },
  components: { tr: 'Bileşenler', en: 'Components' },
  catalyst: { tr: 'Katalitik konvertör', en: 'Catalyst' },
  heatedCatalyst: { tr: 'Isıtmalı katalizör', en: 'Heated catalyst' },
  evap: { tr: 'Yakıt buharı (EVAP)', en: 'Evaporative system' },
  secondaryAir: { tr: 'İkincil hava', en: 'Secondary air' },
  particulateFilter: { tr: 'Benzin partikül filtresi', en: 'Gasoline particulate filter' },
  oxygenSensor: { tr: 'O2 sensörü', en: 'Oxygen sensor' },
  oxygenSensorHeater: { tr: 'O2 sensör ısıtıcısı', en: 'Oxygen sensor heater' },
  egrVvt: { tr: 'EGR / VVT', en: 'EGR / VVT' },
  nmhcCatalyst: { tr: 'NMHC katalizörü', en: 'NMHC catalyst' },
  noxScr: { tr: 'NOx / SCR', en: 'NOx / SCR' },
  boostPressure: { tr: 'Turbo basıncı', en: 'Boost pressure' },
  exhaustGasSensor: { tr: 'Egzoz gazı sensörü', en: 'Exhaust gas sensor' },
  pmFilter: { tr: 'Dizel partikül filtresi', en: 'Particulate filter' },
};

/** A plain offline answer to "will it pass inspection readiness?". Rules differ by country. */
export function readinessAnswer(readiness: Readiness | undefined, language: Language): string {
  if (!readiness) {
    return language === 'tr' ? 'Önce araca bağlan; hazırlık durumu araçtan okunur.' : 'Connect first; readiness is read from the car.';
  }
  const pending = readiness.monitors.filter((m) => m.status === 'incomplete').map((m) => MONITOR_NAMES[m.id]?.[language] ?? m.id);
  const lines: string[] = [];
  if (language === 'tr') {
    lines.push(readiness.milOn ? `Arıza lambası yanıyor (${readiness.dtcCount} kod). Bu haliyle muayeneden önce servise gitmelisin.` : 'Arıza lambası sönük.');
    lines.push(pending.length ? `Tamamlanmamış testler: ${pending.join(', ')}.` : 'Desteklenen tüm testler tamamlanmış.');
    lines.push('Muayene kuralları ülkeye göre değişir; bu bir garanti değildir.');
  } else {
    lines.push(readiness.milOn ? `The warning lamp is on (${readiness.dtcCount} codes). Visit a garage before the inspection.` : 'The warning lamp is off.');
    lines.push(pending.length ? `Incomplete monitors: ${pending.join(', ')}.` : 'All supported monitors are complete.');
    lines.push('Inspection rules differ by country; this is not a guarantee.');
  }
  return lines.join('\n');
}

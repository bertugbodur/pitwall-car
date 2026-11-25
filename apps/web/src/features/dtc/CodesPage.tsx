import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PromptContext } from '@pitwall/ai';
import { getPid, type Dtc, type DtcKind } from '@pitwall/obd-core';
import { describeDtc, searchDtc, type DtcInfo } from '@pitwall/dtc-data';
import { Badge, Button, Card, Input, Notice, PageTitle } from '../../components/ui.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { num } from '../../lib/format.ts';
import { acknowledgeCodes, scan } from '../../lib/session.ts';
import { useLive } from '../../lib/store.ts';
import { ConnectPanel } from '../connect/ConnectPanel.tsx';
import { AskAi } from './AskAi.tsx';
import { aiContext } from './context.ts';
import { MONITOR_NAMES } from './readiness.ts';

const useStrings = defineStrings(
  'codes',
  {
    title: 'Arıza kodları',
    scan: 'Yeniden tara',
    scanning: 'Okunuyor…',
    none: 'Kayıtlı arıza kodu yok.',
    stored: 'Kayıtlı',
    pending: 'Bekleyen',
    permanent: 'Kalıcı',
    safety: 'Güvenlikle ilgili: aracı güvenli bir yerde durdur ve servise başvur.',
    disclaimer: 'Bilgilendirme amaçlıdır; teşhis değildir ve servisin yerini tutmaz.',
    causes: 'Olası sebepler',
    symptoms: 'Belirtiler',
    englishOnly: 'Bu kodun Türkçe metni henüz yok; İngilizce gösteriliyor. Yapay zekâya Türkçe açıklatabilirsin.',
    maker: 'Üreticiye özel kod. Anlamı markaya göre değişir ve çevrimdışı veritabanında yoktur.',
    unknown: 'Bu kod çevrimdışı veritabanında bulunamadı.',
    details: 'Ayrıntı (İngilizce)',
    explain: 'Yapay zekâ ile açıkla',
    freeze: 'Arıza anındaki değerler',
    readiness: 'Muayene hazırlık durumu',
    milOn: 'Arıza lambası yanıyor',
    milOff: 'Arıza lambası sönük',
    complete: 'Tamam',
    incomplete: 'Tamamlanmadı',
    unsupported: 'Yok',
    lookup: 'Kod veya belirti ara',
    lookupHint: 'Örn. P0420 ya da “ateşleme”',
    noClear: 'pitwall arıza kodlarını silmez: silmek sorunu çözmeden gizler ve hazırlık durumunu sıfırlar.',
  },
  {
    title: 'Trouble codes',
    scan: 'Scan again',
    scanning: 'Reading…',
    none: 'No stored trouble codes.',
    stored: 'Stored',
    pending: 'Pending',
    permanent: 'Permanent',
    safety: 'Safety related: stop somewhere safe and contact a garage.',
    disclaimer: 'For information only; this is not a diagnosis and does not replace a garage.',
    causes: 'Likely causes',
    symptoms: 'Symptoms',
    englishOnly: '',
    maker: 'Manufacturer specific code. Its meaning depends on the make and is not in the offline database.',
    unknown: 'This code is not in the offline database.',
    details: 'Details',
    explain: 'Explain with AI',
    freeze: 'Values when the fault was recorded',
    readiness: 'Inspection readiness',
    milOn: 'Warning lamp is on',
    milOff: 'Warning lamp is off',
    complete: 'Complete',
    incomplete: 'Incomplete',
    unsupported: 'n/a',
    lookup: 'Look up a code or symptom',
    lookupHint: 'e.g. P0420 or “misfire”',
    noClear: 'pitwall does not clear codes: clearing hides the problem without fixing it and resets readiness.',
  },
);

export function CodeCard({ code, kinds, safetyCritical }: { code: string; kinds: DtcKind[]; safetyCritical: boolean }) {
  const t = useStrings();
  const language = useLanguage();
  const [info, setInfo] = useState<DtcInfo>();
  const [context, setContext] = useState<PromptContext>();

  useEffect(() => {
    void describeDtc(code).then(setInfo);
  }, [code]);

  const text = info?.[language] ?? info?.en;
  const detail = info?.en;

  return (
    <article className="grid gap-3 rounded-lg border border-line bg-surface p-5 shadow-card" data-testid={`dtc-${code}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="tnum m-0 text-2xl font-bold">{code}</h2>
        {kinds.map((kind) => (
          <Badge key={kind} tone={safetyCritical ? 'danger' : 'warn'}>{t(kind)}</Badge>
        ))}
      </header>
      {safetyCritical && <Notice tone="danger">{t('safety')}</Notice>}
      {info?.manufacturerSpecific && <Notice>{t('maker')}</Notice>}
      {info && !info.manufacturerSpecific && !text && <Notice>{t('unknown')}</Notice>}
      {text && (
        <div>
          <p className="m-0 font-semibold">{text.title}</p>
          <p className="mt-1 mb-0 text-[14px] text-muted">{text.description}</p>
          {language === 'tr' && !info?.tr && <p className="mb-0 text-xs text-muted">{t('englishOnly')}</p>}
        </div>
      )}
      {text && text.causes.length > 0 && (
        <div>
          <h3 className="m-0 text-[13px] font-semibold">{t('causes')}</h3>
          <ol className="m-0 pl-5 text-[14px]">
            {text.causes.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ol>
        </div>
      )}
      {detail && (
        <details className="text-[14px]">
          <summary className="min-h-8 cursor-pointer font-semibold">{t('details')}</summary>
          <p>{detail.description}</p>
          {detail.symptoms.length > 0 && (
            <>
              <h3 className="m-0 text-[13px] font-semibold">{t('symptoms')}</h3>
              <ul className="m-0 pl-5">
                {detail.symptoms.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      {context ? (
        <AskAi context={context} onClose={() => setContext(undefined)} />
      ) : (
        <Button className="justify-self-start" onClick={() => void aiContext(language, code).then(setContext)}>
          <Sparkles size={16} aria-hidden="true" /> {t('explain')}
        </Button>
      )}
      <p className="m-0 border-t border-line pt-2 text-xs text-muted">{t('disclaimer')}</p>
    </article>
  );
}

/** One card per code, with every list it appears in. */
export function groupCodes(dtcs: readonly Dtc[]): { code: string; kinds: DtcKind[]; safetyCritical: boolean }[] {
  const groups = new Map<string, { code: string; kinds: DtcKind[]; safetyCritical: boolean }>();
  for (const dtc of dtcs) {
    const group = groups.get(dtc.code) ?? { code: dtc.code, kinds: [], safetyCritical: dtc.safetyCritical };
    group.kinds.push(dtc.kind);
    groups.set(dtc.code, group);
  }
  return [...groups.values()].sort((a, b) => Number(b.safetyCritical) - Number(a.safetyCritical));
}

function FreezeFrameCard() {
  const t = useStrings();
  const language = useLanguage();
  const frame = useLive((s) => s.freezeFrame);
  if (!frame) return null;
  return (
    <Card title={t('freeze')} subtitle={frame.dtc}>
      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {frame.readings.map((r) => (
          <div key={r.pid}>
            <dt className="text-[13px] text-muted">{getPid(r.pid)?.name[language] ?? r.name}</dt>
            <dd className="tnum m-0 text-xl font-bold">
              {num(r.value, language, 1)} <span className="text-sm text-muted">{r.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ReadinessCard() {
  const t = useStrings();
  const language = useLanguage();
  const readiness = useLive((s) => s.readiness);
  if (!readiness) return null;
  return (
    <Card title={t('readiness')} action={<Badge tone={readiness.milOn ? 'warn' : 'ok'}>{readiness.milOn ? t('milOn') : t('milOff')}</Badge>}>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {readiness.monitors
          .filter((m) => m.status !== 'unsupported')
          .map((monitor) => (
            <li key={monitor.id} className="flex items-center justify-between gap-2 rounded-sm bg-raised px-3 py-2 text-[14px]">
              {MONITOR_NAMES[monitor.id]?.[language] ?? monitor.id}
              <Badge tone={monitor.status === 'complete' ? 'ok' : 'warn'}>{t(monitor.status)}</Badge>
            </li>
          ))}
      </ul>
    </Card>
  );
}

function Lookup() {
  const t = useStrings();
  const language = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ code: string; title: string }[]>([]);
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    let current = true;
    void searchDtc(query, language, 8).then((found) => current && setResults(found));
    return () => {
      current = false;
    };
  }, [query, language]);

  return (
    <Card title={t('lookup')}>
      <Input aria-label={t('lookup')} placeholder={t('lookupHint')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="m-0 mt-2 list-none p-0">
        {results.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              className="min-h-11 w-full cursor-pointer border-0 border-b border-line bg-transparent p-2 text-left text-text"
              onClick={() => setSelected(r.code)}
            >
              <strong className="tnum">{r.code}</strong> {r.title}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="mt-3">
          <CodeCard key={selected} code={selected} kinds={[]} safetyCritical={false} />
        </div>
      )}
    </Card>
  );
}

export function CodesPage() {
  const t = useStrings();
  const status = useLive((s) => s.status);
  const dtcs = useLive((s) => s.dtcs);
  const scanning = useLive((s) => s.scanning);
  const connected = status === 'connected' || status === 'reconnecting';
  const groups = groupCodes(dtcs ?? []);

  // Reading this page counts as having seen the codes.
  useEffect(() => acknowledgeCodes(), [dtcs]);

  return (
    <div className="grid gap-4">
      <PageTitle
        title={t('title')}
        subtitle={t('noClear')}
        action={
          connected && (
            <Button variant="primary" disabled={scanning} onClick={() => void scan()}>
              {scanning ? t('scanning') : t('scan')}
            </Button>
          )
        }
      />
      <ConnectPanel />
      {connected && dtcs && groups.length === 0 && <Notice tone="ok">{t('none')}</Notice>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <CodeCard key={group.code} {...group} />
        ))}
        {connected && (
          <>
            <FreezeFrameCard />
            <ReadinessCard />
          </>
        )}
      </div>
      <Lookup />
    </div>
  );
}

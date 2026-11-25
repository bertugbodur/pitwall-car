import { Link, useNavigate } from '@tanstack/react-router';
import { ClipboardCheck, Fuel, MapPinned, Send, Sparkles, Wrench } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { PromptContext } from '@pitwall/ai';
import { Button, Card, Input, Notice } from '../../components/ui.tsx';
import { defineStrings, useLanguage } from '../../i18n/index.ts';
import { listTrips } from '../../lib/db.ts';
import { duration } from '../../lib/format.ts';
import { useSettings } from '../../lib/settings.ts';
import { useLive } from '../../lib/store.ts';
import { AskAi } from '../dtc/AskAi.tsx';
import { aiContext } from '../dtc/context.ts';
import { readinessAnswer } from '../dtc/readiness.ts';

const useStrings = defineStrings(
  'assistant',
  {
    title: 'Yapay zekâ asistanı',
    hello: 'Aracınla ilgili ne öğrenmek istersin?',
    explain: 'Arızayı açıkla',
    consumption: 'Tüketimimi analiz et',
    plan: 'Yolculuk planla',
    inspection: 'Muayeneye hazır mıyım?',
    message: 'Mesajın',
    placeholder: 'Örn. Rölanti neden dalgalanıyor?',
    send: 'Hazırla',
    consumptionQuestion: 'Yakıt tüketimimi yorumla ve azaltmak için neler yapabileceğimi söyle.',
    noTrips: 'Henüz kayıtlı yolculuk yok. Bağlıyken yapılan sürüşler otomatik kaydedilir.',
  },
  {
    title: 'AI assistant',
    hello: 'What would you like to know about your car?',
    explain: 'Explain the fault',
    consumption: 'Analyse my consumption',
    plan: 'Plan a trip',
    inspection: 'Ready for inspection?',
    message: 'Your message',
    placeholder: 'e.g. Why is the idle unsteady?',
    send: 'Prepare',
    consumptionQuestion: 'Comment on my fuel consumption and tell me how to reduce it.',
    noTrips: 'No recorded trips yet. Drives made while connected are recorded automatically.',
  },
);

function Action({ icon, label, onClick }: { icon: ReactNode; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-line bg-raised p-3 text-center text-[13px] font-semibold text-text"
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

export function AssistantCard() {
  const t = useStrings();
  const language = useLanguage();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState<PromptContext>();
  const [offline, setOffline] = useState<string>();

  const reset = () => {
    setContext(undefined);
    setOffline(undefined);
  };

  async function analyseConsumption() {
    reset();
    const trips = (await listTrips()).slice(0, 10);
    if (trips.length === 0) return setOffline(t('noTrips'));
    const notes = [
      `Fuel type: ${useSettings.getState().profile.fuel}`,
      'Recent trips:',
      ...trips.map(
        (trip) =>
          `- ${trip.distanceKm.toFixed(1)} km, average speed ${trip.avgSpeed.toFixed(0)} km/h, ` +
          `${trip.avgConsumption?.toFixed(1) ?? '?'} L/100 km, idling ${duration(trip.idleSec, 'en')}`,
      ),
    ];
    setContext({ language, dtcs: [], notes, question: t('consumptionQuestion') });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    reset();
    setContext(await aiContext(language, undefined, question.trim()));
  }

  return (
    <Card title={t('title')} subtitle={t('hello')} action={<Sparkles aria-hidden="true" />}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Action icon={<Wrench />} label={t('explain')} onClick={() => void navigate({ to: '/codes' })} />
          <Action icon={<Fuel />} label={t('consumption')} onClick={() => void analyseConsumption()} />
          <Action icon={<MapPinned />} label={t('plan')} onClick={() => void navigate({ to: '/planner' })} />
          <Action
            icon={<ClipboardCheck />}
            label={t('inspection')}
            onClick={() => {
              reset();
              setOffline(readinessAnswer(useLive.getState().readiness, language));
            }}
          />
        </div>
        {offline && (
          <Notice>
            <span className="whitespace-pre-wrap">{offline}</span>{' '}
            <Link to="/codes" className="text-accent-ink">→</Link>
          </Notice>
        )}
        {context && <AskAi key={context.question ?? ''} context={context} onClose={reset} />}
        <form className="flex gap-2" onSubmit={(e) => void submit(e)}>
          <Input aria-label={t('message')} placeholder={t('placeholder')} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <Button type="submit" variant="ink">
            <Send size={16} aria-hidden="true" /> {t('send')}
          </Button>
        </form>
      </div>
    </Card>
  );
}

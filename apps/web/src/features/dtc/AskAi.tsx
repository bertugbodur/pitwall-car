import { Send, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { ask, buildPrompt, listOllamaModels, parseAnswer, PROVIDERS, type Answer, type PromptContext } from '@pitwall/ai';
import { Badge, Button, Notice } from '../../components/ui.tsx';
import { defineStrings } from '../../i18n/index.ts';
import { useSettings } from '../../lib/settings.ts';

const useStrings = defineStrings(
  'ai',
  {
    preview: 'Gönderilecek veri',
    previewHint: '{{provider}} sağlayıcısına tam olarak bu metin gider. Şasi numarası ve konum asla eklenmez.',
    includeCar: 'Marka, model ve yılı da gönder',
    send: 'Gönder',
    sending: 'Yanıt bekleniyor…',
    cancel: 'Vazgeç',
    close: 'Kapat',
    stop: 'Hemen güvenli bir yerde dur',
    soon: 'Yakında servise git',
    watch: 'İzle',
    disclaimer: 'Bilgilendirme amaçlıdır; teşhis değildir ve servisin yerini tutmaz.',
    setup: 'Sağlayıcı ve anahtar Ayarlar sayfasından seçilir.',
  },
  {
    preview: 'What will be sent',
    previewHint: 'Exactly this text goes to {{provider}}. The VIN and your location are never included.',
    includeCar: 'Also send make, model and year',
    send: 'Send',
    sending: 'Waiting for an answer…',
    cancel: 'Cancel',
    close: 'Close',
    stop: 'Stop somewhere safe now',
    soon: 'Visit a garage soon',
    watch: 'Keep an eye on it',
    disclaimer: 'For information only; this is not a diagnosis and does not replace a garage.',
    setup: 'Choose the provider and key in Settings.',
  },
);

/** Shows what would leave the device, sends it only on request, renders the answer. */
export function AskAi({ context, onClose }: { context: PromptContext; onClose(): void }) {
  const t = useStrings();
  const { aiProvider, aiKeys, aiModels, ollamaUrl, profile } = useSettings();
  const [includeCar, setIncludeCar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer>();
  const [error, setError] = useState<string>();
  // Frozen at opening time so what the user reads is what gets sent.
  const [frozen] = useState(context);
  const prompt = buildPrompt({ ...frozen, vehicle: includeCar ? profile.makeModelYear : undefined });
  const provider = PROVIDERS[aiProvider];

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      let model = aiModels[aiProvider];
      if (aiProvider === 'ollama' && !model) model = (await listOllamaModels(ollamaUrl))[0];
      const text = await ask({ provider: aiProvider, prompt, model, key: aiKeys[aiProvider], baseUrl: ollamaUrl });
      setAnswer(parseAnswer(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const tone = answer?.urgency === 'stop' ? 'danger' : answer?.urgency === 'soon' ? 'warn' : 'ok';

  return (
    <div className="grid gap-3 rounded-md border border-line bg-raised p-4" data-testid="ask-ai">
      {!answer && (
        <>
          <div>
            <div className="text-[13px] font-semibold">{t('preview')}</div>
            <div className="text-xs text-muted">{t('previewHint', { provider: provider.name })}</div>
          </div>
          <pre className="m-0 max-h-48 overflow-auto rounded-sm bg-surface p-3 text-xs whitespace-pre-wrap">{prompt.user}</pre>
          {profile.makeModelYear && (
            <label className="flex min-h-11 items-center gap-2 text-[13px]">
              <input type="checkbox" className="size-5" checked={includeCar} onChange={(e) => setIncludeCar(e.target.checked)} />
              {t('includeCar')} ({profile.makeModelYear})
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="ink" disabled={busy} onClick={() => void send()}>
              <Send size={16} aria-hidden="true" /> {busy ? t('sending') : t('send')}
            </Button>
            <Button onClick={onClose}>{t('cancel')}</Button>
          </div>
          <p className="m-0 text-xs text-muted">{t('setup')}</p>
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {answer && (
        <>
          <div className="flex items-center gap-2">
            <Sparkles size={18} aria-hidden="true" />
            {answer.urgency && <Badge tone={tone}>{t(answer.urgency)}</Badge>}
            <Button className="ml-auto" aria-label={t('close')} onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
          <div className="text-[14px] whitespace-pre-wrap">{answer.text}</div>
          <p className="m-0 text-xs text-muted">{t('disclaimer')}</p>
        </>
      )}
    </div>
  );
}

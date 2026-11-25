import { describe, expect, test, vi } from 'vitest';
import { AiError, ask, buildPrompt, parseAnswer, PROVIDERS, type ProviderId } from '../src/index.ts';

const context = {
  language: 'tr' as const,
  dtcs: [{ code: 'P0301', kind: 'stored', title: '1. silindirde ateşleme kaçağı' }],
  freezeFrame: [{ name: 'Engine speed', value: 2150, unit: 'rpm' }],
  live: [{ name: 'Coolant temperature', value: 90.4, unit: '°C' }],
};
const prompt = { system: 's', user: 'u' };

describe('prompt', () => {
  test('carries codes and values and asks for the answer format', () => {
    const { system, user } = buildPrompt(context);
    expect(user).toContain('P0301');
    expect(user).toContain('Engine speed: 2150 rpm');
    expect(user).toContain('Coolant temperature: 90.4 °C');
    expect(system).toContain('URGENCY:');
    expect(system).toMatch(/Turkish/);
    expect(system).toMatch(/never suggest clearing/i);
  });

  test('mentions the car only when the user shared it', () => {
    expect(buildPrompt(context).user).not.toContain('Vehicle:');
    expect(buildPrompt({ ...context, vehicle: 'Renault Clio 2018' }).user).toContain('Vehicle: Renault Clio 2018');
  });

  test('cannot leak a VIN or a position: unknown fields are ignored', () => {
    const sneaky = { ...context, vin: 'NM0PW000000000001', location: 'Kadıköy' };
    const { system, user } = buildPrompt(sneaky);
    expect(system + user).not.toContain('NM0PW000000000001');
    expect(system + user).not.toContain('Kadıköy');
  });

  test('removes anything that looks like a VIN from free text', () => {
    const { user } = buildPrompt({ ...context, question: 'şasi nm0pw000000000001 neden?' });
    expect(user.toUpperCase()).not.toContain('NM0PW000000000001');
  });
});

describe('answer', () => {
  test.each([
    ['URGENCY: stop\n\nMotoru durdur.', 'stop'],
    ['**URGENCY:** soon\nMetin', 'soon'],
    ['urgency: WATCH\nMetin', 'watch'],
    ['Metin', undefined],
  ])('reads urgency from %j', (text, urgency) => {
    const answer = parseAnswer(text);
    expect(answer.urgency).toBe(urgency);
    expect(answer.text.toLowerCase()).not.toContain('urgency');
  });
});

const REPLIES: Record<ProviderId, unknown> = {
  anthropic: { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'cevap' }] },
  openai: { choices: [{ message: { content: 'cevap' } }] },
  openrouter: { choices: [{ message: { content: 'cevap' } }] },
  gemini: { candidates: [{ content: { parts: [{ text: 'cevap' }] } }] },
  ollama: { message: { content: 'cevap' } },
};

const HOSTS: Record<ProviderId, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  openrouter: 'openrouter.ai',
  gemini: 'generativelanguage.googleapis.com',
  ollama: 'localhost:11434',
};

const replying = (provider: ProviderId) =>
  vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(REPLIES[provider])));

describe('providers', () => {
  test.each(Object.keys(PROVIDERS) as ProviderId[])('%s: sends the key only to its own host', async (provider) => {
    const fetch = replying(provider);
    expect(await ask({ provider, key: 'secret-key', fetch, prompt })).toBe('cevap');

    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(url).host).toBe(HOSTS[provider]);
    expect(url).not.toContain('secret-key');
    expect(JSON.stringify(init.headers).includes('secret-key')).toBe(provider !== 'ollama');
    expect(String(init.body)).not.toContain('secret-key');
  });

  test('asks Anthropic to allow a call straight from the browser', async () => {
    const fetch = replying('anthropic');
    await ask({ provider: 'anthropic', key: 'k', fetch, prompt });
    expect(fetch.mock.calls[0]![1].headers).toMatchObject({ 'anthropic-dangerous-direct-browser-access': 'true' });
  });

  test('needs a key for cloud providers and says why a call failed', async () => {
    const fetch = vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 }));
    await expect(ask({ provider: 'openai', key: '', fetch, prompt })).rejects.toThrow(AiError);
    expect(fetch).not.toHaveBeenCalled();
    await expect(ask({ provider: 'openai', key: 'k', fetch, prompt })).rejects.toThrow(/401.*bad key/);
  });
});

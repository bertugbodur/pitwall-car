/** Optional AI explanations with the user's own model and key. Calls go straight to the provider. */

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

export interface PromptValue {
  name: string;
  value: number;
  unit: string;
}

/** Everything that may be sent. There is deliberately no field for a VIN or a position. */
export interface PromptContext {
  language: 'tr' | 'en';
  dtcs: readonly { code: string; kind: string; title?: string }[];
  freezeFrame?: readonly PromptValue[];
  live?: readonly PromptValue[];
  vehicle?: string;
  question?: string;
  /** Plain text facts such as readiness or consumption summaries. */
  notes?: readonly string[];
}

export interface Prompt {
  system: string;
  user: string;
}

export interface Answer {
  urgency: 'stop' | 'soon' | 'watch' | undefined;
  text: string;
}

const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const values = (list: readonly PromptValue[]) =>
  list.map((v) => `- ${v.name}: ${Math.round(v.value * 10) / 10} ${v.unit}`).join('\n');

export function buildPrompt(context: PromptContext): Prompt {
  const language = context.language === 'tr' ? 'Turkish' : 'English';
  const system = [
    `You explain car OBD-II data to a driver with no mechanical background. Answer in ${language}.`,
    'You are not a mechanic and must not claim a certain diagnosis.',
    'Never suggest clearing or erasing trouble codes, and never suggest anything that changes how the car behaves.',
    'If a fault can affect brakes, steering, airbags, cooling or oil pressure, say first that the driver should stop safely or get service.',
    'Start with one line exactly like "URGENCY: stop", "URGENCY: soon" or "URGENCY: watch".',
    'Then use these headings: plain explanation; likely causes (most likely first); what you can check yourself; what to tell the garage.',
    'Be short and concrete.',
  ].join(' ');

  const parts: string[] = [];
  if (context.vehicle) parts.push(`Vehicle: ${context.vehicle}`);
  parts.push(
    context.dtcs.length
      ? `Trouble codes:\n${context.dtcs.map((d) => `- ${d.code} (${d.kind})${d.title ? `: ${d.title}` : ''}`).join('\n')}`
      : 'Trouble codes: none stored.',
  );
  if (context.freezeFrame?.length) parts.push(`Values when the fault was recorded:\n${values(context.freezeFrame)}`);
  if (context.live?.length) parts.push(`Current values:\n${values(context.live)}`);
  if (context.notes?.length) parts.push(context.notes.join('\n'));
  if (context.question) parts.push(`Question: ${context.question}`);

  return { system, user: parts.join('\n\n').replace(VIN, '[removed]') };
}

export function parseAnswer(raw: string): Answer {
  const line = /^[ \t*#]*urgency[ \t*:]*(stop|soon|watch)[ \t*.]*$/im.exec(raw);
  return {
    urgency: line?.[1]?.toLowerCase() as Answer['urgency'],
    text: (line ? raw.replace(line[0], '') : raw).trim(),
  };
}

interface Request {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

interface Provider {
  name: string;
  defaultModel: string;
  needsKey: boolean;
  request(options: { model: string; key: string; baseUrl: string; prompt: Prompt }): Request;
  read(reply: any): string | undefined;
}

const MAX_TOKENS = 2000;
const chat = ({ system, user }: Prompt) => [
  { role: 'system', content: system },
  { role: 'user', content: user },
];

const openAiStyle = (name: string, url: string, defaultModel: string): Provider => ({
  name,
  defaultModel,
  needsKey: true,
  request: ({ model, key, prompt }) => ({
    url,
    headers: { authorization: `Bearer ${key}` },
    body: { model, messages: chat(prompt) },
  }),
  read: (reply) => reply?.choices?.[0]?.message?.content,
});

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-5-5',
    needsKey: true,
    request: ({ model, key, prompt }) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: { model, max_tokens: MAX_TOKENS, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] },
    }),
    read: (reply) => reply?.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(''),
  },
  openai: openAiStyle('OpenAI', 'https://api.openai.com/v1/chat/completions', 'gpt-6-luna'),
  openrouter: openAiStyle('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', 'openrouter/auto'),
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-3.5-flash-lite',
    needsKey: true,
    request: ({ model, key, prompt }) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': key },
      body: {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      },
    }),
    read: (reply) => reply?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join(''),
  },
  ollama: {
    name: 'Ollama',
    defaultModel: 'gemma4',
    needsKey: false,
    request: ({ model, baseUrl, prompt }) => ({
      url: `${baseUrl.replace(/\/+$/, '')}/api/chat`,
      headers: {},
      body: { model, messages: chat(prompt), stream: false },
    }),
    read: (reply) => reply?.message?.content,
  },
};

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiError';
  }
}

export interface AskOptions {
  provider: ProviderId;
  prompt: Prompt;
  key?: string;
  model?: string;
  /** Ollama only. */
  baseUrl?: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

/** Models installed in the local Ollama, empty when it cannot be reached. */
export async function listOllamaModels(baseUrl = 'http://localhost:11434'): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`);
    const reply = (await response.json()) as { models?: { name: string }[] };
    return reply.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

export async function ask(options: AskOptions): Promise<string> {
  const provider = PROVIDERS[options.provider];
  const key = options.key?.trim() ?? '';
  if (provider.needsKey && !key) throw new AiError(`${provider.name} needs an API key`);

  const { url, headers, body } = provider.request({
    model: options.model?.trim() || provider.defaultModel,
    key,
    baseUrl: options.baseUrl || 'http://localhost:11434',
    prompt: options.prompt,
  });
  const send = options.fetch ?? ((input: string, init: RequestInit) => fetch(input, init));
  let response: Response;
  try {
    response = await send(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch {
    throw new AiError(`Could not reach ${provider.name}. Check the connection (for Ollama: is it running, is OLLAMA_ORIGINS set?)`);
  }
  const reply: any = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new AiError(`${provider.name} ${response.status}: ${reply?.error?.message ?? reply?.error ?? response.statusText}`);
  }
  const text = provider.read(reply);
  if (!text) throw new AiError(`${provider.name} sent an empty answer`);
  return text;
}

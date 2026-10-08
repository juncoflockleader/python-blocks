import { checkGuidance, instructions, responseSchema, type Guidance } from './catalog';

export interface SharedContext { python?: string; blocks?: string; diagnostics?: string }
export interface HelpRequest { mode: 'explain' | 'predict' | 'debug'; question: string; context: SharedContext }
export interface Usage { input: number; output: number }
export interface HelpResult { guidance: Guidance; usage: Usage | null }
export const ENDPOINT = 'https://api.openai.com/v1/responses';
export const MAX_CONTEXT = 12_000;

export function validateRequest(request: HelpRequest, key: string) {
  if (!request.question.trim() || request.question.length > 1500) throw new Error('Ask a question of 1–1,500 characters.');
  const text = JSON.stringify(request);
  if (Object.values(request.context).join('').length > MAX_CONTEXT) throw new Error('Selected context exceeds 12,000 characters. Share a smaller Python excerpt or fewer items.');
  if ((key && text.includes(key)) || /\bsk-[A-Za-z0-9_-]{12,}/.test(text)) throw new Error('The selected text appears to contain an API key. Remove it before sharing.');
  if (!['explain', 'predict', 'debug'].includes(request.mode)) throw new Error('Choose a supported help mode.');
}

async function boundedJson(response: Response): Promise<any> {
  const reader = response.body?.getReader(); if (!reader) throw new Error('The provider returned an empty response.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > 64_000) { await reader.cancel(); throw new Error('The provider response was too large. Nothing was shown.'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('The provider returned an unreadable response. Nothing was shown.'); }
}

export async function requestHelp(key: string, model: string, request: HelpRequest, signal: AbortSignal, fetcher = fetch): Promise<HelpResult> {
  validateRequest(request, key);
  signal.throwIfAborted();
  if (!key || key.length > 512 || /\s/.test(key)) throw new Error('Enter a valid API key.');
  if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(model) || model.startsWith('sk-') || model.includes(key)) throw new Error('Enter a model ID from your provider.');
  let response: Response;
  try {
    response = await fetcher(ENDPOINT, { method: 'POST', signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, store: false, stream: false, max_output_tokens: 400, instructions,
        input: [{ role: 'user', content: JSON.stringify(request) }],
        text: { format: { type: 'json_schema', name: 'learner_guidance', strict: true, schema: responseSchema } },
      }),
    });
  } catch { signal.throwIfAborted(); throw new Error('Could not reach OpenAI. Check your connection and browser access, then try again.'); }
  signal.throwIfAborted();
  if (!response.ok) {
    await response.body?.cancel();
    const messages: Record<number, string> = {
      400: 'This model or request is not supported. Choose a model that supports structured responses.',
      401: 'OpenAI did not accept this key. Clear it and enter a valid key.',
      403: 'This key does not have access. Check provider permissions.',
      404: 'This model is unavailable for your key. Choose another model.',
      429: 'The provider rate or spending limit was reached. Check your account before trying again.',
    };
    throw new Error(messages[response.status] ?? 'OpenAI is unavailable right now. Try again later.');
  }
  const body = await boundedJson(response); signal.throwIfAborted();
  if (!body || typeof body !== 'object') throw new Error('The provider returned an unreadable response.');
  if (body.status !== 'completed' || !Array.isArray(body.output)) throw new Error('The provider did not complete the guidance. Nothing was shown.');
  const messages = body.output.filter((item: any) => item?.type === 'message');
  if (body.output.some((item: any) => !item || !['message', 'reasoning'].includes(item.type)) || messages.length !== 1 || messages[0].role !== 'assistant' ||
      !Array.isArray(messages[0].content) || messages[0].content.length !== 1 || messages[0].content[0]?.type !== 'output_text') {
    throw new Error('The provider could not offer supported guidance. Nothing was shown.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(messages[0].content[0].text); }
  catch { throw new Error('The provider returned unsupported guidance. Nothing was shown.'); }
  const guidance = checkGuidance(parsed, request.context.python ? request.context.python.split('\n').length : 0);
  const input = body.usage?.input_tokens, output = body.usage?.output_tokens;
  const usage = [input, output].every(n => Number.isSafeInteger(n) && n >= 0 && n < 1e8) ? { input, output } : null;
  return { guidance, usage };
}

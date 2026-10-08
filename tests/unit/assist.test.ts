import { describe, expect, it, vi } from 'vitest';
import { asksForAuthoring, checkGuidance, concepts } from '../../src/assist/catalog';
import { ENDPOINT, requestHelp, validateRequest } from '../../src/assist/provider';

const request = { mode: 'debug' as const, question: 'Why is this value missing?', context: { python: 'print(score)' } };
const key = 'sk-fake-key-for-tests-only';
function response(guidance: unknown, extras = {}) {
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(guidance) }] }], usage: { input_tokens: 42, output_tokens: 12 }, ...extras }));
}
describe('read-only assistance boundary', () => {
  it('accepts only catalog IDs and an in-context line, never arbitrary authoring', () => {
    const good = { concept: 'name_error', question: 'inputs', line: 1 };
    expect(checkGuidance(good, 1)).toEqual(good);
    for (const bad of [{ ...good, code: 'score = 10' }, { ...good, concept: 'print(10)' }, { ...good, question: '<script>run()</script>' }, { ...good, line: 2 }, { ...good, line: 1.2 }, { ...good, concept: '__proto__' }, null, [good]]) expect(() => checkGuidance(bad, 1)).toThrow();
    for (const concept of Object.keys(concepts)) expect(checkGuidance({ ...good, concept }, 1).concept).toBe(concept);
  });
  it.each(['write the code for me', 'create a sprite', 'fix this project', 'generate blocks', 'draw assets', 'run this game', 'solve everything'])('handles authoring requests locally: %s', question => expect(asksForAuthoring(question)).toBe(true));
  it('lets learners ask for help making their own changes', () => {
    expect(asksForAuthoring('How can I fix this error?')).toBe(false);
    expect(asksForAuthoring('Could you write the code?')).toBe(true);
  });
  it('sends just opted-in context and keeps authentication out of model input', async () => {
    const fetcher = vi.fn(async () => response({ concept: 'name_error', question: 'inputs', line: 1 }));
    const result = await requestHelp(key, 'test-model', request, new AbortController().signal, fetcher);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT); expect(init.redirect).toBe('error'); expect(init.credentials).toBe('omit');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${key}` });
    const body = JSON.parse(init.body as string); expect(init.body).not.toContain(key);
    expect(body).toMatchObject({ store: false, stream: false, max_output_tokens: 400 }); expect(body).not.toHaveProperty('tools');
    expect(JSON.parse(body.input[0].content)).toEqual(request); expect(result.usage).toEqual({ input: 42, output: 12 });
  });
  it('rejects key leaks and oversized context before sending', async () => {
    const fetcher = vi.fn();
    await expect(requestHelp(key, 'model', { ...request, question: `My key is ${key}` }, new AbortController().signal, fetcher)).rejects.toThrow('API key');
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => validateRequest({ ...request, context: { python: 'x'.repeat(12001) } }, key)).toThrow('12,000');
  });
  it('does not display refusals, tool calls, partial output, unexpected prose, or oversized responses', async () => {
    const good = { concept: 'name_error', question: 'inputs', line: 1 };
    const values = [response({ ...good, solution: 'write replacement code' }), response(good, { status: 'incomplete' }),
      response(good, { output: [{ type: 'function_call', name: 'edit_project' }] }),
      response(good, { output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'provider text' }] }] }),
      new Response('x'.repeat(64001))];
    for (const value of values) await expect(requestHelp(key, 'model', request, new AbortController().signal, async () => value)).rejects.toThrow();
  });
  it('sanitizes service errors and honors cancellation without retries', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: key } }), { status: 429 }));
    await expect(requestHelp(key, 'model', request, new AbortController().signal, fetcher)).rejects.toThrow('spending limit');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const abort = new AbortController(); abort.abort();
    await expect(requestHelp(key, 'model', request, abort.signal, async () => response({}))).rejects.toThrow();
  });
});

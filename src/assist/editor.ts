import { asksForAuthoring, concepts, questions, type Guidance } from './catalog';
import { requestHelp, validateRequest, type HelpRequest, type SharedContext } from './provider';

interface AssistOptions {
  read(kind: keyof SharedContext): string;
  pilotActive(): boolean;
}
// This module receives text readers only. There is deliberately no workspace,
// runner, project loader, dispatch function, or generic tool bridge here.
export function installAssist(options: AssistOptions) {
  const panel = document.createElement('details'); panel.id = 'assist-panel'; panel.className = 'learning-panel';
  panel.innerHTML = `<summary>AI assist <span>Understand, predict, investigate · you make every change</span></summary>
    <p id="assist-pilot-notice" hidden>AI assist is off during the learner pilot. Finish the session to enable it.</p>
    <p>This optional helper chooses a concept and a question to think about. It cannot write code, solve your project, make artwork, edit, or Run. Its suggested focus can be wrong.</p>
    <p>Use your own key with a trusted copy of this app. The key lives in this tab’s memory and is cleared on reload or Disable. OpenAI receives each question and the context you explicitly share. Account charges and provider data policies apply. No key or conversation is saved in your project.</p>
    <form id="assist-enable-form"><fieldset id="assist-settings"><legend>Connection for this tab</legend><div class="learning-fields">
      <label>Provider <select id="assist-provider"><option value="openai">OpenAI</option></select></label>
      <label>Model ID <input id="assist-model" value="gpt-4o-mini" maxlength="100" required autocomplete="off" spellcheck="false"></label>
      <label>Your API key <input id="assist-key" type="password" required maxlength="512" autocomplete="off" spellcheck="false"></label>
      <label>Maximum requests in this tab <input id="assist-limit" type="number" min="1" max="20" value="5" required></label>
      <label>Input USD per million tokens (optional) <input id="assist-input-rate" type="number" min="0" max="10000" step="any" placeholder="From provider pricing"></label>
      <label>Output USD per million tokens (optional) <input id="assist-output-rate" type="number" min="0" max="10000" step="any" placeholder="From provider pricing"></label>
    </div><p>Check your model’s <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">current pricing</a> and <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noreferrer">provider spending limits</a>. Each request allows at most 400 output tokens. The request count is a local guard, not an account spending limit.</p><button id="assist-enable" class="button secondary">Enable for this tab</button></fieldset></form>
    <p id="assist-connection"></p><button id="assist-disable" class="button secondary" hidden>Disable & clear key and conversation</button>
    <fieldset id="assist-question-fields" disabled><legend>Ask for help</legend><div class="learning-fields">
      <label>Help with <select id="assist-mode"><option value="explain">Understanding</option><option value="predict">Making a prediction</option><option value="debug">Investigating an error</option></select></label>
      <label>Your question <textarea id="assist-question" rows="3" maxlength="1500" placeholder="What did you expect? What surprised you?"></textarea></label>
    </div><div class="learning-actions"><label><input id="assist-share-python" type="checkbox"> Python selection, or current Python file</label><label><input id="assist-share-blocks" type="checkbox"> Last selected block description</label><label><input id="assist-share-diagnostics" type="checkbox"> Visible errors and output</label></div>
    <p>All sharing starts off. Select text in Python or a block before reviewing. A snapshot can include your names, comments, messages, and printed values. Images, sounds, pilot notes, recovery copies, and other modules are not included.</p>
    <button id="assist-review" class="button secondary">Review what will be shared</button></fieldset>
    <section id="assist-preview" hidden aria-label="Context to share"><h3>Review this snapshot</h3><p>OpenAI will receive this text plus the app’s fixed coaching instructions. No conversation history is sent.</p><pre id="assist-context" tabindex="0"></pre><button id="assist-send" class="button primary">Send this snapshot to OpenAI</button></section>
    <button id="assist-cancel" class="button secondary" hidden>Cancel request</button><p id="assist-status" role="status">Disabled. No requests have been sent.</p>
    <p id="assist-usage" role="status"></p><section id="assist-answer" hidden aria-label="Coaching guidance"><h3 id="assist-concept"></h3><p id="assist-explanation"></p><p id="assist-focus"></p><p id="assist-prompt"></p><small>Guidance for your reviewed snapshot. Check it against your own observations.</small></section>`;
  document.querySelector('#pilot-panel')!.after(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>(`#assist-${id}`)!;
  let key = '', model = '', limit = 5, requests = 0, input = 0, output = 0, estimated = 0, uncertain = 0;
  let rates: { input: number; output: number } | null = null;
  let preview: HelpRequest | null = null, pending: AbortController | null = null, epoch = 0;
  let pilot = options.pilotActive();
  const status = (text: string) => { el('status').textContent = text; };
  const showError = (error: unknown) => status(error instanceof Error ? error.message : 'The request could not be completed.');
  function usage() {
    el('usage').textContent = `${requests}/${limit} requests sent in this tab · ${input} input + ${output} output tokens reported. ${rates ? `Estimated known cost: $${estimated.toFixed(6)} (your entered rates).` : 'Cost unavailable: enter your model’s rates to estimate future requests.'}${uncertain ? ` ${uncertain} request(s) have unknown usage or cost; check your provider bill.` : ''}`;
  }
  function controls() {
    el('enable-form').hidden = !!key;
    el('connection').textContent = key ? `OpenAI · ${model} · key held in this tab only` : '';
    el<HTMLFieldSetElement>('settings').disabled = !!key || pilot;
    el<HTMLFieldSetElement>('question-fields').disabled = !key || !!pending || pilot;
    el('disable').hidden = !key; el('cancel').hidden = !pending;
    el<HTMLButtonElement>('send').disabled = !key || !preview || !!pending || pilot || requests >= limit;
    el('pilot-notice').hidden = !pilot; usage();
  }
  function invalidate() { preview = null; el('preview').hidden = true; controls(); }
  function cancel(message = 'Request cancelled. The provider may still charge for work already done.') {
    ++epoch; pending?.abort(); pending = null; invalidate(); status(message);
  }
  function disable() {
    cancel('Disabled. Key and conversation cleared.'); key = ''; model = ''; rates = null;
    el<HTMLInputElement>('key').value = ''; el<HTMLTextAreaElement>('question').value = '';
    el('context').textContent = ''; el('answer').hidden = true;
    for (const id of ['concept', 'explanation', 'focus', 'prompt']) el(id).textContent = '';
    for (const kind of ['python', 'blocks', 'diagnostics']) el<HTMLInputElement>(`share-${kind}`).checked = false;
    controls();
  }
  function render(guidance: Guidance) {
    const [title, explanation] = concepts[guidance.concept];
    el('concept').textContent = title; el('explanation').textContent = explanation; el('prompt').textContent = questions[guidance.question];
    el('focus').textContent = guidance.line ? `Consider line ${guidance.line} in the shared Python excerpt. This is a suggested place to investigate.` : '';
    el('answer').hidden = false;
  }
  function capture(): HelpRequest {
    const context: SharedContext = {};
    for (const kind of ['python', 'blocks', 'diagnostics'] as const) if (el<HTMLInputElement>(`share-${kind}`).checked) {
      const text = options.read(kind); if (!text.trim()) throw new Error(`No ${kind} text is available. Select something to share or uncheck it.`); context[kind] = text;
    }
    const request = { question: el<HTMLTextAreaElement>('question').value, mode: el<HTMLSelectElement>('mode').value as HelpRequest['mode'], context };
    validateRequest(request, key); return request;
  }
  el('enable-form').addEventListener('submit', event => {
    event.preventDefault(); if (pilot || options.pilotActive()) return;
    const nextKey = el<HTMLInputElement>('key').value.trim(), nextModel = el<HTMLInputElement>('model').value.trim(), nextLimit = Number(el<HTMLInputElement>('limit').value);
    if (!nextKey || nextKey.length > 512 || /\s/.test(nextKey) || !/^[a-zA-Z0-9._:-]{1,100}$/.test(nextModel) || nextModel.startsWith('sk-') || nextModel.includes(nextKey)) { status('Enter a valid key and model ID.'); return; }
    if (!Number.isInteger(nextLimit) || nextLimit < 1 || nextLimit > 20) { status('Choose a request limit from 1 to 20.'); return; }
    const a = el<HTMLInputElement>('input-rate').value, b = el<HTMLInputElement>('output-rate').value;
    if ((a || b) && (!a || !b || ![Number(a), Number(b)].every(n => Number.isFinite(n) && n >= 0 && n <= 10000))) { status('Enter both rates, or leave both empty.'); return; }
    key = nextKey; model = nextModel; limit = nextLimit; rates = a && b ? { input: Number(a), output: Number(b) } : null;
    el<HTMLInputElement>('key').value = ''; status('Enabled for this tab. Review your question and context before sending.'); controls();
  });
  el('disable').addEventListener('click', disable);
  el('question-fields').addEventListener('input', invalidate);
  el('review').addEventListener('click', () => {
    if (!key || pending || pilot || options.pilotActive()) return;
    try {
      const request = capture();
      if (asksForAuthoring(request.question)) { invalidate(); render({ concept: 'authorship', question: 'clarify', line: 0 }); status('No request sent. Ask for an explanation, prediction question, or debugging hint.'); return; }
      preview = request;
      const context = Object.entries(request.context).map(([kind, value]: [string, string]) => {
        const title = kind === 'python' ? 'Python excerpt (line numbers are for guidance)' : kind === 'blocks' ? 'Block description' : 'Errors and output';
        const text = kind === 'python' ? value.split('\n').map((line, i) => `${i + 1} | ${line}`).join('\n') : value;
        return `${title}\n${text}`;
      });
      el('context').textContent = [`Help: ${request.mode}`, `Question: ${request.question}`, ...context].join('\n\n'); el('preview').hidden = false;
      el('answer').hidden = true; status('Snapshot ready to review. Nothing has been sent.'); controls();
    } catch (error) { invalidate(); showError(error); }
  });
  el('send').addEventListener('click', async () => {
    if (!key || !preview || pending || pilot || options.pilotActive() || requests >= limit) return;
    // Re-read just the opted-in sources. Changing the work invalidates consent
    // to a stale snapshot; it never causes an automatic replacement or send.
    try { if (JSON.stringify(capture()) !== JSON.stringify(preview)) { invalidate(); status('Your question or selected context changed. Review a new snapshot before sending.'); return; } }
    catch (error) { invalidate(); showError(error); return; }
    const request = preview, controller = new AbortController(), generation = ++epoch;
    pending = controller; requests++; uncertain++; el('answer').hidden = true; status('Asking for a guiding idea…'); controls();
    const timeout = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), 30_000);
    try {
      const result = await requestHelp(key, model, request, controller.signal);
      if (generation !== epoch || controller.signal.aborted) return;
      if (result.usage) {
        input += result.usage.input; output += result.usage.output;
        if (rates) { estimated += (result.usage.input * rates.input + result.usage.output * rates.output) / 1_000_000; uncertain--; }
      }
      render(result.guidance); status('A concept and a question to investigate. Your project is unchanged.');
    } catch (error) {
      if (generation === epoch) {
        if (controller.signal.aborted) status('Request timed out. No guidance was shown. Check provider usage before retrying.');
        else showError(error);
      }
    } finally { clearTimeout(timeout); if (generation === epoch) { pending = null; preview = null; controls(); } }
  });
  el('cancel').addEventListener('click', () => cancel());
  window.addEventListener('pagehide', disable);
  controls();
  return { setPilotActive(active: boolean) { pilot = active; if (active) disable(); controls(); }, dispose() { disable(); window.removeEventListener('pagehide', disable); panel.remove(); } };
}

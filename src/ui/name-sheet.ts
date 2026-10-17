export interface NameRequest {
  title: string;
  value: string;
  confirm: string;
  hint: string;
  validate(name: string, scope: string): string | null;
  /** Optional choice of where the name applies; the first option is the default. */
  scopes?: { label: string; value: string }[];
}
export interface NameAnswer { name: string; scope: string }

let pending: ((answer: NameAnswer | null) => void) | null = null;
let current: NameRequest | null = null;

function sheet() {
  let dialog = document.getElementById('name-sheet') as HTMLDialogElement | null;
  if (dialog) return dialog;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="name-sheet" class="name-sheet" aria-labelledby="name-sheet-title"><form id="name-sheet-form">
    <h2 id="name-sheet-title"></h2>
    <label>Name <input id="name-sheet-input" maxlength="64" required autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="name-sheet-error name-sheet-hint"></label>
    <fieldset id="name-sheet-scopes" hidden><legend>Who can use it</legend></fieldset>
    <p id="name-sheet-error" role="alert"></p><p id="name-sheet-hint" class="tab-note"></p>
    <div class="dialog-actions"><button type="button" id="name-sheet-cancel" class="button secondary">Cancel</button><button id="name-sheet-confirm" class="button primary"></button></div>
  </form></dialog>`);
  dialog = document.getElementById('name-sheet') as HTMLDialogElement;
  const input = document.getElementById('name-sheet-input') as HTMLInputElement, error = document.getElementById('name-sheet-error')!;
  const scope = () => document.querySelector<HTMLInputElement>('#name-sheet-scopes input:checked')?.value ?? '';
  const finish = (answer: NameAnswer | null) => { const resolve = pending; pending = null; current = null; dialog!.close(); resolve?.(answer); };
  document.getElementById('name-sheet-form')!.addEventListener('submit', event => {
    event.preventDefault();
    const name = input.value.trim(), problem = current?.validate(name, scope()) ?? null;
    if (problem) { error.textContent = problem; input.focus(); return; }
    finish({ name, scope: scope() });
  });
  input.addEventListener('input', () => { error.textContent = ''; });
  document.getElementById('name-sheet-cancel')!.addEventListener('click', () => finish(null));
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
  return dialog;
}

/** A small native-feeling sheet that asks one question: the name. */
export function askName(request: NameRequest): Promise<NameAnswer | null> {
  const dialog = sheet();
  pending?.(null); current = request;
  document.getElementById('name-sheet-title')!.textContent = request.title;
  document.getElementById('name-sheet-confirm')!.textContent = request.confirm;
  document.getElementById('name-sheet-hint')!.textContent = request.hint;
  document.getElementById('name-sheet-error')!.textContent = '';
  const scopes = document.getElementById('name-sheet-scopes')!;
  scopes.hidden = !request.scopes?.length;
  scopes.replaceChildren(scopes.querySelector('legend')!, ...(request.scopes ?? []).map((option, index) => {
    const label = document.createElement('label'), radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'name-sheet-scope'; radio.value = option.value; radio.checked = index === 0;
    label.append(radio, ` ${option.label}`); return label;
  }));
  const input = document.getElementById('name-sheet-input') as HTMLInputElement;
  input.value = request.value;
  if (!dialog.open) dialog.showModal();
  input.focus(); input.select();
  return new Promise(resolve => { pending = resolve; });
}

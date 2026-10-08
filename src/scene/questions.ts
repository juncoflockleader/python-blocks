export type QuestionCommand = { type: 'ask'; id: number; text: string } | { type: 'cancel'; id: number } | { type: 'clear' };
export interface QuestionReply { id: number; answer: string | null }
export function validQuestionCommand(value: unknown): value is QuestionCommand {
  const q = value as QuestionCommand;
  return !!q && (q.type === 'clear' || (q.type === 'cancel' || q.type === 'ask' && typeof q.text === 'string' && q.text.length <= 400) && Number.isSafeInteger(q.id) && q.id > 0);
}
export function validQuestionReply(value: unknown): value is QuestionReply {
  const q = value as QuestionReply;
  return !!q && Number.isSafeInteger(q.id) && q.id > 0 && (q.answer === null || typeof q.answer === 'string' && q.answer.length <= 2048);
}
export interface QuestionHost {
  begin(reply: (value: QuestionReply) => void): void;
  accept(command: QuestionCommand): void;
  stop(): void;
}

/** One accessible input form; queued requests never overwrite the current draft. */
export class Questions implements QuestionHost {
  private queue: Extract<QuestionCommand, { type: 'ask' }>[] = [];
  private current: number | null = null;
  private reply: (value: QuestionReply) => void = () => {};
  private form: HTMLFormElement;
  private label: HTMLElement;
  private answer: HTMLInputElement;
  onActive: () => void = () => {};
  private root: HTMLElement; private stage: HTMLElement;
  constructor(root: HTMLElement, stage: HTMLElement) {
    this.root = root; this.stage = stage;
    root.innerHTML = '<form id="question-form" aria-labelledby="question-text" hidden><p id="question-count"></p><label id="question-text" for="question-answer"></label><div><input id="question-answer" maxlength="2048" autocomplete="off"><button class="button primary">Answer</button><button id="question-cancel" class="button secondary" type="button">Cancel question</button></div><small>Other activities keep running. Cancel returns None.</small></form>';
    this.form = root.querySelector('form')!; this.label = root.querySelector('#question-text')!; this.answer = root.querySelector('input')!;
    this.form.addEventListener('submit', e => { e.preventDefault(); this.respond(this.answer.value); });
    root.querySelector('#question-cancel')!.addEventListener('click', () => this.respond(null));
    this.answer.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); this.respond(null); } });
  }
  begin(reply: (value: QuestionReply) => void) { this.stop(); this.reply = reply; }
  accept(command: QuestionCommand) {
    if (!validQuestionCommand(command)) throw new Error('Invalid question request.');
    if (command.type === 'clear') this.queue = [];
    else if (command.type === 'cancel') this.queue = this.queue.filter(q => q.id !== command.id);
    else {
      if (this.queue.length >= 16 || this.queue.some(q => q.id === command.id)) throw new Error('Too many pending questions or a duplicate question.');
      this.queue.push({ ...command });
    }
    this.render();
  }
  private respond(answer: string | null) {
    const q = this.queue.shift(); if (!q) return;
    this.reply({ id: q.id, answer }); this.render();
  }
  private render() {
    const q = this.queue[0], next = q?.id ?? null, hadFocus = this.root.contains(document.activeElement);
    this.root.dataset.pendingQuestions = String(this.queue.length);
    this.form.hidden = !q;
    this.root.querySelector('#question-count')!.textContent = this.queue.length > 1 ? `${this.queue.length} questions waiting` : 'Your project asks';
    if (this.current === next) return;
    this.current = next; this.answer.value = ''; this.label.textContent = q ? q.text || 'Your answer' : '';
    if (q) { this.onActive(); this.answer.focus({ preventScroll: true }); this.form.scrollIntoView({ block: 'nearest' }); }
    else if (hadFocus) this.stage.focus({ preventScroll: true });
  }
  stop() { this.queue = []; this.reply = () => {}; this.render(); }
}

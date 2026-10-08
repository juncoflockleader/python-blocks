import { validQuestionReply, type QuestionHost } from '../scene/questions';
import type { AudioHost } from './audio';
import { validateInput, type SceneInput, type SceneState } from '../scene/model';
import { encodeHostEvent, eventLimits, type ExecutionMode, type RunnerCommand, type RunnerEvent } from './protocol';

export class PythonRunner {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingPing: number | null = null;
  private pendingEvents = new Set<number>();
  private nextId = 0;
  private ready = false;
  private pointerId: number | null = null;
  private pointerDown = false;
  private queuedPointer: Extract<SceneInput, { kind: 'pointer' }> | null = null;

  private readonly audio?: AudioHost;
  private readonly questions?: QuestionHost;
  private readonly onEvent: (event: RunnerEvent) => void;
  constructor(onEvent: (event: RunnerEvent) => void, audio?: AudioHost, questions?: QuestionHost) { this.onEvent = onEvent; this.audio = audio; this.questions = questions; }

  run(code: string, mode: ExecutionMode = 'sequential', files: Record<string, string> = {}, scene?: SceneState, runtimeURL?: string) {
    this.dispose();
    const worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    const audioEnded = (id: number, error?: string) => { if (this.worker === worker) worker.postMessage({ type: 'audio-ended', id, ...(error ? { error } : {}) } satisfies RunnerCommand); };
    this.questions?.begin(reply => { if (this.worker === worker && validQuestionReply(reply)) worker.postMessage({ type: 'answer', reply } satisfies RunnerCommand); });
    this.audio?.begin(scene?.sounds ?? [], audioEnded);
    this.setDeadline(60_000, 'Python took too long to start. Please try again.');
    worker.onmessage = (event: MessageEvent<RunnerEvent>) => {
      if (this.worker !== worker) return;
      const message = event.data;
      if (message.type === 'question') {
        if (this.questions) this.questions.accept(message.command);
        else if (message.command.type === 'ask') worker.postMessage({ type: 'answer', reply: { id: message.command.id, answer: null } } satisfies RunnerCommand);
        return;
      }
      if (message.type === 'audio') {
        if (this.audio) this.audio.accept(message.command);
        else if ('id' in message.command) audioEnded(message.command.id, 'This host does not support audio.');
        return;
      }
      if (message.type === 'started') {
        if (mode === 'events') this.ping();
        else this.setDeadline(10_000, 'Stopped after 10 seconds. Check your loops and try again.');
      }
      if (message.type === 'pong') {
        if (message.id === this.pendingPing) {
          this.pendingPing = null; clearTimeout(this.timer);
          this.pingTimer = setTimeout(() => this.ping(), eventLimits.pingIntervalMs);
        }
        return;
      }
      if (message.type === 'event-ack') {
        this.pendingEvents.delete(message.id);
        if (message.id === this.pointerId) {
          this.pointerId = null;
          const latest = this.queuedPointer; this.queuedPointer = null;
          if (latest) this.input(latest);
        }
        return;
      }
      if (message.type === 'ready') this.ready = mode === 'events';
      if (message.type === 'done' || message.type === 'error') this.dispose();
      this.onEvent(message);
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      this.dispose();
      this.onEvent({ type: 'error', message: event.message || 'Python could not start. Please try again.' });
    };
    worker.postMessage({ type: 'run', code, mode, files, ...(runtimeURL ? { runtimeURL } : {}), ...(scene ? { scene } : {}) } satisfies RunnerCommand);
  }

  emit(name: string, payload: unknown = null): boolean {
    if (!this.worker || !this.ready) return false;
    const message = encodeHostEvent(name, payload);
    return this.sendInput(id => ({ type: 'event', id, message }));
  }

  input(input: SceneInput): boolean {
    validateInput(input);
    if (!this.worker || !this.ready) return false;
    if (input.kind === 'reset') { this.queuedPointer = null; this.pointerId = null; this.pointerDown = false; }
    if (input.kind === 'pointer') {
      // Coalesce positions under worker pressure, while retaining every button transition.
      if (this.pointerId !== null && input.down === this.pointerDown) { this.queuedPointer = input; return true; }
      this.queuedPointer = null; this.pointerDown = input.down;
    }
    return this.sendInput(id => { if (input.kind === 'pointer') this.pointerId = id; return { type: 'input', id, input }; });
  }

  private sendInput(command: (id: number) => RunnerCommand): boolean {
    if (this.pendingEvents.size >= eventLimits.pendingHostEvents) {
      this.dispose();
      this.onEvent({ type: 'error', exceptionType: 'EventOverloadError', message: `Too many pending input events (limit ${eventLimits.pendingHostEvents}). Send events more slowly.` });
      return false;
    }
    const id = ++this.nextId; this.pendingEvents.add(id);
    this.worker!.postMessage(command(id));
    return true;
  }

  stop() {
    this.dispose();
    this.onEvent({ type: 'status', message: 'Stopped' });
  }

  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.pingTimer);
    this.pendingPing = null; this.pendingEvents.clear(); this.ready = false;
    this.pointerId = null; this.queuedPointer = null; this.pointerDown = false;
    this.worker?.terminate();
    this.worker = null;
    this.audio?.stop(); this.questions?.stop();
  }

  private ping() {
    if (!this.worker) return;
    this.pendingPing = ++this.nextId;
    this.setDeadline(eventLimits.watchdogMs, 'The event session stopped responding. Add an explicit wait inside long-running loops, then run again.');
    this.worker.postMessage({ type: 'ping', id: this.pendingPing } satisfies RunnerCommand);
  }

  private setDeadline(milliseconds: number, message: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.dispose();
      this.onEvent({ type: 'error', message });
    }, milliseconds);
  }
}

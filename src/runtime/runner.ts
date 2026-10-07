import { encodeHostEvent, eventLimits, type ExecutionMode, type RunnerCommand, type RunnerEvent } from './protocol';

export class PythonRunner {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingPing: number | null = null;
  private pendingEvents = new Set<number>();
  private nextId = 0;
  private ready = false;

  private readonly onEvent: (event: RunnerEvent) => void;
  constructor(onEvent: (event: RunnerEvent) => void) { this.onEvent = onEvent; }

  run(code: string, mode: ExecutionMode = 'sequential', files: Record<string, string> = {}) {
    this.dispose();
    const worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    this.setDeadline(60_000, 'Python took too long to start. Please try again.');
    worker.onmessage = (event: MessageEvent<RunnerEvent>) => {
      if (this.worker !== worker) return;
      const message = event.data;
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
      if (message.type === 'event-ack') { this.pendingEvents.delete(message.id); return; }
      if (message.type === 'ready') this.ready = mode === 'events';
      if (message.type === 'done' || message.type === 'error') this.dispose();
      this.onEvent(message);
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      this.dispose();
      this.onEvent({ type: 'error', message: event.message || 'Python could not start. Please try again.' });
    };
    worker.postMessage({ type: 'run', code, mode, files } satisfies RunnerCommand);
  }

  emit(name: string, payload: unknown = null): boolean {
    if (!this.worker || !this.ready) return false;
    const message = encodeHostEvent(name, payload);
    if (this.pendingEvents.size >= eventLimits.pendingHostEvents) {
      this.dispose();
      this.onEvent({ type: 'error', exceptionType: 'EventOverloadError', message: `Too many pending input events (limit ${eventLimits.pendingHostEvents}). Send events more slowly.` });
      return false;
    }
    const id = ++this.nextId; this.pendingEvents.add(id);
    this.worker.postMessage({ type: 'event', id, message } satisfies RunnerCommand);
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
    this.worker?.terminate();
    this.worker = null;
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

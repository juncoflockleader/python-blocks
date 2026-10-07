import type { RunnerEvent } from './protocol';

export class PythonRunner {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly onEvent: (event: RunnerEvent) => void) {}

  run(code: string) {
    this.dispose();
    const worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    this.setDeadline(60_000, 'Python took too long to start. Please try again.');
    worker.onmessage = (event: MessageEvent<RunnerEvent>) => {
      if (this.worker !== worker) return;
      const message = event.data;
      if (message.type === 'status' && message.message === 'Drawing…') {
        this.setDeadline(10_000, 'Stopped after 10 seconds. Check your loops and try again.');
      }
      if (message.type === 'done' || message.type === 'error') this.dispose();
      this.onEvent(message);
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      this.dispose();
      this.onEvent({ type: 'error', message: event.message || 'Python could not start. Please try again.' });
    };
    worker.postMessage({ code });
  }

  stop() {
    this.dispose();
    this.onEvent({ type: 'status', message: 'Stopped' });
  }

  dispose() {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
  }

  private setDeadline(milliseconds: number, message: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.dispose();
      this.onEvent({ type: 'error', message });
    }, milliseconds);
  }
}

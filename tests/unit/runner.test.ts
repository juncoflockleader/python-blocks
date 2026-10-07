import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PythonRunner } from '../../src/runtime/runner';
import type { RunnerEvent } from '../../src/runtime/protocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: RunnerEvent }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  emit(event: RunnerEvent) { this.onmessage?.({ data: event }); }
}

beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal('Worker', FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Python worker lifecycle', () => {
  it('terminates a stopped run and ignores messages from its worker after restart', () => {
    const receive = vi.fn(); const runner = new PythonRunner(receive);
    runner.run('while True: pass'); const old = FakeWorker.instances[0];
    runner.stop(); expect(old.terminate).toHaveBeenCalledOnce();
    runner.run('print(42)'); receive.mockClear();
    old.emit({ type: 'done' }); expect(receive).not.toHaveBeenCalled();
    FakeWorker.instances[1].emit({ type: 'done' });
    expect(receive).toHaveBeenCalledWith({ type: 'done' });
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
  });

  it('allows runtime startup time separately from the program time budget', () => {
    const receive = vi.fn(); const runner = new PythonRunner(receive);
    runner.run('while True: pass'); const worker = FakeWorker.instances[0];
    vi.advanceTimersByTime(20_000); expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({ type: 'status', message: 'Drawing…' });
    vi.advanceTimersByTime(10_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }));
  });
});

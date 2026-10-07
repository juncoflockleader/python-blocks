import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PythonRunner } from '../../src/runtime/runner';
import { encodeHostEvent, eventLimits, type RunnerEvent } from '../../src/runtime/protocol';

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
    worker.emit({ type: 'started' });
    vi.advanceTimersByTime(10_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('keeps a healthy event session alive beyond the sequential deadline', () => {
    const receive = vi.fn(); const runner = new PythonRunner(receive);
    runner.run('event source', 'events'); const worker = FakeWorker.instances[0];
    worker.emit({ type: 'started' }); worker.emit({ type: 'ready' });
    for (let index = 0; index < 20; index++) {
      const ping = worker.postMessage.mock.calls.at(-1)![0];
      expect(ping.type).toBe('ping'); worker.emit({ type: 'pong', id: ping.id });
      vi.advanceTimersByTime(eventLimits.pingIntervalMs);
    }
    expect(worker.terminate).not.toHaveBeenCalled();
    runner.stop(); vi.advanceTimersByTime(20_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates a blocked event worker even if it keeps sending output or a stale pong', () => {
    const receive = vi.fn(); const runner = new PythonRunner(receive);
    runner.run('while True: pass', 'events'); const worker = FakeWorker.instances[0];
    worker.emit({ type: 'started' });
    worker.emit({ type: 'pong', id: -1 }); worker.emit({ type: 'stdout', text: 'still busy' });
    vi.advanceTimersByTime(eventLimits.watchdogMs);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'error', message: expect.stringContaining('explicit wait') }));
  });

  it('delivers bounded host input only to a ready current session and releases acknowledged slots', () => {
    const receive = vi.fn(); const runner = new PythonRunner(receive);
    runner.run('events', 'events'); const first = FakeWorker.instances[0];
    expect(runner.emit('tick')).toBe(false); first.emit({ type: 'ready' });
    for (let index = 0; index < 2 * eventLimits.pendingHostEvents; index++) {
      expect(runner.emit('tick', { index })).toBe(true);
      const event = first.postMessage.mock.calls.at(-1)![0];
      expect(JSON.parse(event.message)).toEqual({ name: 'tick', payload: { index } });
      first.emit({ type: 'event-ack', id: event.id, accepted: true });
    }
    runner.run('new events', 'events'); const second = FakeWorker.instances[1];
    first.emit({ type: 'ready' }); expect(runner.emit('tick')).toBe(false);
    second.emit({ type: 'ready' });
    for (let index = 0; index < eventLimits.pendingHostEvents; index++) expect(runner.emit('tick')).toBe(true);
    expect(runner.emit('tick')).toBe(false); expect(second.terminate).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ exceptionType: 'EventOverloadError' }));
  });
});

describe('host event boundaries', () => {
  it('snapshots JSON-compatible input and counts encoded payload bytes', () => {
    const payload = { values: [1, 0.5, true, null, '雪'] };
    const result = encodeHostEvent('雪', payload); payload.values.push(2);
    expect(JSON.parse(result)).toEqual({ name: '雪', payload: { values: [1, 0.5, true, null, '雪'] } });
    expect(() => encodeHostEvent('tick', 'x'.repeat(eventLimits.payloadBytes - 2))).not.toThrow();
    expect(() => encodeHostEvent('tick', 'x'.repeat(eventLimits.payloadBytes - 1))).toThrow('too large');
  });
  it('rejects unsupported values, cycles, deep nesting, and reserved names', () => {
    const cycle: unknown[] = []; cycle.push(cycle);
    let deep: unknown = null; for (let index = 0; index <= eventLimits.payloadDepth; index++) deep = [deep];
    for (const payload of [undefined, NaN, Infinity, 2 ** 53, new Date(), 1n, () => 1, cycle, deep, Array(eventLimits.payloadNodes).fill(null)]) expect(() => encodeHostEvent('tick', payload)).toThrow();
    for (const name of ['', 'x'.repeat(eventLimits.eventNameLength + 1), 'start']) expect(() => encodeHostEvent(name, null)).toThrow();
  });
});

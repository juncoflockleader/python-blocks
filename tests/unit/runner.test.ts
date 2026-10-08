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
  it('routes question answers to their own worker and clears forms on errors and replacement', () => {
    const questions = { begin: vi.fn(), accept: vi.fn(), stop: vi.fn() }, runner = new PythonRunner(vi.fn(), undefined, questions);
    runner.run('questions', 'events'); const old = FakeWorker.instances[0], reply = questions.begin.mock.calls[0][0];
    old.emit({type:'question',command:{type:'ask',id:1,text:'Name?'}}); expect(questions.accept).toHaveBeenCalledWith({type:'ask',id:1,text:'Name?'});
    reply({id:1,answer:'Ada'}); expect(old.postMessage).toHaveBeenLastCalledWith({type:'answer',reply:{id:1,answer:'Ada'}});
    runner.run('replacement','events'); const current = FakeWorker.instances[1]; reply({id:2,answer:'stale'}); expect(current.postMessage).toHaveBeenCalledTimes(1);
    const currentReply = questions.begin.mock.calls[1][0]; currentReply({id:0,answer:'invalid'}); expect(current.postMessage).toHaveBeenCalledTimes(1);
    current.emit({type:'error',message:'failure'}); expect(questions.stop).toHaveBeenCalledTimes(3);
  });
  it('captures audio assets, routes completions to their worker and stops audio on every disposal', () => {
    const audio = { begin: vi.fn(), accept: vi.fn(), stop: vi.fn() }, runner = new PythonRunner(vi.fn(), audio);
    runner.run('sounds', 'events'); const old = FakeWorker.instances[0], complete = audio.begin.mock.calls[0][1];
    old.emit({ type: 'audio', command: { type: 'stop', owner: null } }); expect(audio.accept).toHaveBeenCalledOnce();
    complete(1); expect(old.postMessage).toHaveBeenLastCalledWith({type:'audio-ended',id:1});
    runner.run('new sounds', 'events'); const current = FakeWorker.instances[1];
    complete(2); expect(current.postMessage).toHaveBeenCalledTimes(1); expect(audio.stop).toHaveBeenCalledTimes(2);
    current.emit({type:'error',message:'failure'}); expect(audio.stop).toHaveBeenCalledTimes(3);
  });
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

  it('routes validated stage input only to the ready worker and shares acknowledgement bounds', () => {
    const runner = new PythonRunner(vi.fn()); const key = { kind: 'key', key: 'ArrowRight', down: true } as const;
    expect(runner.input(key)).toBe(false); runner.run('handlers', 'events'); const worker = FakeWorker.instances[0];
    expect(runner.input(key)).toBe(false); worker.emit({ type: 'ready' }); expect(runner.input(key)).toBe(true);
    const packet = worker.postMessage.mock.calls.at(-1)![0]; expect(packet).toEqual({ type: 'input', id: expect.any(Number), input: key });
    worker.emit({ type: 'event-ack', id: packet.id, accepted: true });
    expect(() => runner.input({ kind: 'key', key: 'invalid', down: true })).toThrow('Invalid stage input');
    runner.stop(); expect(runner.input(key)).toBe(false);
  });

  it('coalesces pointer motion without dropping press/release transitions or retaining stale movement', () => {
    const receive = vi.fn(), runner = new PythonRunner(receive);
    runner.run('handlers', 'events'); const worker = FakeWorker.instances[0]; worker.emit({ type: 'ready' });
    const point = (x: number, down = false) => ({ kind: 'pointer' as const, x, y: 0, down, inside: true });
    runner.input(point(0)); const first = worker.postMessage.mock.calls.at(-1)![0];
    for (let i = 0; i < 1000; i++) runner.input(point(i % 240));
    expect(worker.postMessage).toHaveBeenCalledTimes(2); // startup plus one outstanding position
    worker.emit({ type: 'event-ack', id: first.id, accepted: true });
    expect(worker.postMessage.mock.calls.at(-1)![0].input.x).toBe(999 % 240);
    runner.input(point(3, true)); const press = worker.postMessage.mock.calls.at(-1)![0];
    runner.input(point(4, true)); // held move is coalesced
    runner.input(point(5, false)); const release = worker.postMessage.mock.calls.at(-1)![0];
    expect(press.input.down).toBe(true); expect(release.input.down).toBe(false); expect(release.input.x).toBe(5);
    worker.emit({ type: 'event-ack', id: press.id, accepted: true });
    runner.input(point(6)); runner.input({ kind: 'reset' }); const count = worker.postMessage.mock.calls.length;
    worker.emit({ type: 'event-ack', id: release.id, accepted: true });
    expect(worker.postMessage).toHaveBeenCalledTimes(count); expect(worker.terminate).not.toHaveBeenCalled();
    runner.input(point(7)); runner.input(point(8)); runner.stop();
    worker.emit({ type: 'event-ack', id: worker.postMessage.mock.calls.at(-1)![0].id, accepted: true });
    expect(receive).toHaveBeenLastCalledWith({ type: 'status', message: 'Stopped' });
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

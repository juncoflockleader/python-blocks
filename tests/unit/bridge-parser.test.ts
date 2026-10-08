import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { PythonParser } from '../../src/bridge/parser';
import { parserLimits, validParseResult, type ParsedPython, type ParserEvent } from '../../src/bridge/parser-protocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: {data:ParserEvent}) => void) | null = null;
  onerror: ((event: {message:string}) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  emit(data: ParserEvent) { this.onmessage?.({data}); }
  complete(result: ParsedPython) { this.emit({type:'result',id:this.postMessage.mock.calls.at(-1)![0].id,result}); }
}
const empty: ParsedPython = {version:1,pythonVersion:'3.14.2',ok:true,tree:{type:'Module',fields:{body:[],type_ignores:[]}},comments:[],nodeCount:1,sourceBytes:0};
beforeEach(() => { vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal('Worker',FakeWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Python bridge parsing boundary', () => {
  it('validates actual native parser trees and exact UTF-16 source spans without rounding integers', () => {
    const source = '# 😀\r\n雪 = 900719925474099312345678901234567890\r\nprint("🙂", 雪)\r\n';
    const command = "import sys; sys.path.insert(0, 'src/bridge'); from parse_python import parse_source_json; print(parse_source_json(sys.stdin.read()))";
    const result = JSON.parse(execFileSync('python3',['-c',command],{input:source,encoding:'utf8'}));
    expect(validParseResult(result,source.length)).toBe(true);
    const body = result.tree.fields.body;
    expect(body[0].fields.value.fields.value).toEqual({literalType:'int',text:'900719925474099312345678901234567890'});
    const span = body[1].span; expect(source.slice(span.start.offset,span.end.offset)).toBe('print("🙂", 雪)');
    result.nodeCount++; expect(validParseResult(result,source.length)).toBe(false);
  });
  it('keeps startup separate from parsing time and reuses an idle parser', async () => {
    const parser = new PythonParser(), first = parser.parse(''); const worker = FakeWorker.instances[0];
    vi.advanceTimersByTime(20_000); expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({type:'ready'}); vi.advanceTimersByTime(4000); worker.complete(empty); await expect(first).resolves.toEqual(empty);
    const next = parser.parse(''); expect(FakeWorker.instances).toHaveLength(1); worker.complete(empty); await next;
    vi.advanceTimersByTime(60_000); expect(worker.terminate).not.toHaveBeenCalled(); parser.dispose();
  });
  it('terminates superseded requests and rejects stale replies from previous workers', async () => {
    const parser = new PythonParser(), first = parser.parse('old'); const rejected = expect(first).rejects.toMatchObject({name:'AbortError'});
    const old = FakeWorker.instances[0], next = parser.parse(''); await rejected;
    expect(old.terminate).toHaveBeenCalledOnce(); old.complete(empty);
    const current = FakeWorker.instances[1]; current.emit({type:'ready'});
    current.emit({type:'result',id:999,result:empty}); expect(current.terminate).not.toHaveBeenCalled();
    current.complete(empty); await expect(next).resolves.toEqual(empty); parser.dispose();
  });
  it('cancels an in-flight parse and detaches the old abort signal before reuse', async () => {
    const parser = new PythonParser(), signal = new AbortController();
    const pending = parser.parse('',signal.signal), rejected = expect(pending).rejects.toMatchObject({name:'AbortError'}); signal.abort(); await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const oldSignal = new AbortController(), valid = parser.parse('',oldSignal.signal), worker = FakeWorker.instances[1]; worker.emit({type:'ready'}); worker.complete(empty); await valid;
    const next = parser.parse(''); oldSignal.abort(); worker.complete(empty); await next;
    const aborted = new AbortController(); aborted.abort(); await expect(parser.parse('',aborted.signal)).rejects.toMatchObject({name:'AbortError'});
    expect(worker.terminate).not.toHaveBeenCalled(); parser.dispose();
  });
  it('times out startup and native parsing, then permits a fresh worker', async () => {
    const parser = new PythonParser(), startup = parser.parse(''); const rejected = expect(startup).rejects.toThrow('startup timed out');
    vi.advanceTimersByTime(parserLimits.startupMs); await rejected;
    const parse = parser.parse(''), timedOut = expect(parse).rejects.toThrow('parsing took too long');
    FakeWorker.instances[1].emit({type:'ready'}); vi.advanceTimersByTime(parserLimits.parseMs); await timedOut;
    const fresh = parser.parse(''); FakeWorker.instances[2].complete(empty); await fresh; parser.dispose();
  });
  it('rejects invalid results and worker failures without returning a partial syntax tree', async () => {
    const parser = new PythonParser();
    for (const fail of [
      (w: FakeWorker) => w.complete({...empty,version:2} as unknown as ParsedPython),
      (w: FakeWorker) => w.emit({type:'error',message:'loader failed'}),
      (w: FakeWorker) => w.onerror?.({message:'crashed'}),
      (w: FakeWorker) => w.onmessageerror?.(),
    ]) {
      const promise = parser.parse(''), rejected = expect(promise).rejects.toBeInstanceOf(Error), worker = FakeWorker.instances.at(-1)!;
      fail(worker); await rejected; expect(worker.terminate).toHaveBeenCalledOnce();
    }
    expect(validParseResult({...empty,tree:{type:'Module',fields:{body:[]},span:{start:{line:1,column:0,offset:0},end:{line:1,column:1,offset:1}}}},0)).toBe(false);
    const tooLarge = parser.parse('x'.repeat(parserLimits.sourceBytes+1)); await expect(tooLarge).rejects.toThrow('16 MB');
    expect(FakeWorker.instances).toHaveLength(4); parser.dispose();
  });
});

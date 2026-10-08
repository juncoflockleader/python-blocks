import { parserLimits, validParseResult, type ParseResult, type ParserEvent } from './parser-protocol';

interface Pending {
  id: number; sourceLength: number; resolve(result: ParseResult): void; reject(error: Error): void;
  timer?: ReturnType<typeof setTimeout>; removeAbort(): void;
}

export class PythonParser {
  private worker: Worker | null = null;
  private ready = false;
  private nextId = 0;
  private pending: Pending | null = null;

  parse(source: string, signal?: AbortSignal): Promise<ParseResult> {
    if (signal?.aborted) return Promise.reject(new DOMException('Python parsing cancelled.', 'AbortError'));
    if (new TextEncoder().encode(source).length > parserLimits.sourceBytes) return Promise.reject(new Error('Python source exceeds the 16 MB limit.'));
    // There is one in-flight request. Terminating a superseded worker also stops
    // native parsing; merely ignoring its eventual reply would leave it busy.
    if (this.pending) this.cancel();
    if (!this.worker) {
      try { this.worker = new Worker(new URL('./parser.worker.ts', import.meta.url), {type:'module'}); }
      catch (error) { return Promise.reject(error); }
      this.ready = false;
      const worker = this.worker;
      worker.onmessage = ({data}: MessageEvent<ParserEvent>) => {
        if (this.worker !== worker) return;
        if (data?.type === 'ready') {
          if (this.ready) return;
          this.ready = true;
          if (this.pending) this.armTimer(parserLimits.parseMs);
        } else if (data?.type === 'error') this.fail(new Error(data.message));
        else if (data?.type === 'result' && data.id === this.pending?.id) {
          if (!validParseResult(data.result, this.pending.sourceLength)) { this.fail(new Error('Python parser returned an incompatible result. Try again.')); return; }
          const pending = this.takePending()!; pending.resolve(data.result);
        }
      };
      worker.onerror = event => { if (this.worker === worker) this.fail(new Error(event.message || 'Python parser stopped unexpectedly.')); };
      worker.onmessageerror = () => { if (this.worker === worker) this.fail(new Error('Python parser response could not be read.')); };
    }
    return new Promise((resolve, reject) => {
      const id = ++this.nextId, abort = () => this.cancel();
      signal?.addEventListener('abort', abort, {once:true});
      this.pending = { id, sourceLength:source.length, resolve, reject, removeAbort:() => signal?.removeEventListener('abort', abort) };
      this.armTimer(this.ready ? parserLimits.parseMs : parserLimits.startupMs);
      try { this.worker!.postMessage({type:'parse',id,source}); }
      catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  private armTimer(milliseconds: number) {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending.timer = setTimeout(() => this.fail(new Error(this.ready ? 'Python parsing took too long. Simplify the draft and try again.' : 'Python parser startup timed out. Try again.')), milliseconds);
  }
  private takePending() {
    const pending = this.pending; this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.removeAbort(); }
    return pending;
  }
  private fail(error: Error) {
    const pending = this.takePending(); this.worker?.terminate(); this.worker = null; this.ready = false;
    pending?.reject(error);
  }
  cancel() { this.fail(new DOMException('Python parsing cancelled.', 'AbortError')); }
  dispose() { this.cancel(); }
}

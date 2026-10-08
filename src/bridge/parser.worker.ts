import type { PyodideInterface } from 'pyodide';
import parserSource from './parse_python.py?raw';
import limits from './parser-limits.json';
import type { ParseCommand, ParserEvent, ParseResult } from './parser-protocol';

const send = (event: ParserEvent) => self.postMessage(event);
async function initialize() {
  const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href;
  const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`) as { loadPyodide(options: { indexURL: string }): Promise<PyodideInterface> };
  const python = await loadPyodide({indexURL});
  python.FS.writeFile('/home/pyodide/bridge_parser.py', parserSource);
  python.FS.writeFile('/home/pyodide/parser-limits.json', JSON.stringify(limits));
  python.runPython('from bridge_parser import parse_source_json');
  send({type:'ready'});
  return python;
}
// No playground host is installed here. Learner source is passed as a value to
// the trusted parser; it is never interpolated into runPython or executed.
const initialized = initialize();
void initialized.catch(error => send({type:'error',message:`Python parser could not start: ${error instanceof Error ? error.message : String(error)}`}));
self.onmessage = async ({data}: MessageEvent<ParseCommand>) => {
  if (data?.type !== 'parse' || !Number.isSafeInteger(data.id) || typeof data.source !== 'string') return;
  try {
    const python = await initialized;
    python.globals.set('_pb_source_to_parse', data.source);
    try {
      const json = python.runPython('parse_source_json(_pb_source_to_parse)') as string;
      send({type:'result',id:data.id,result:JSON.parse(json) as ParseResult});
    } finally { python.globals.delete('_pb_source_to_parse'); }
  } catch (error) { send({type:'error',message:`Python parsing failed: ${error instanceof Error ? error.message : String(error)}`}); }
};
